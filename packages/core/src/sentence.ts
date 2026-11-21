/**
 * Rule-based sentence evaluator (PRD 8.2 rule table). OWNER: Lane B (core logic).
 * Deterministic, offline, < 20 ms. Runs on the client (instant feedback, offline queue)
 * AND on the server (authoritative; server may replace it with the Claude evaluator,
 * falling back to this on any error / no API key).
 *
 * Gate order: empty -> devanagari -> blocked (moderation) -> word_missing -> scored ('ok').
 * Non-'ok' gates return a zero rubric and do NOT count as a submission.
 */
import { SCORING } from './scoring.config.ts';
import type { FeedbackItem, Rubric, SentenceErrorCode, SentenceEvaluation, SentenceGate, SentenceWordContext } from './types.ts';
import { isLexiconWord } from './data/common-words.ts';
import { isVerbForm } from './data/verbs.ts';
import { moderateSentence } from './moderation.ts';
import { damerauLevenshtein } from './spelling.ts';

export const RULE_EVALUATOR_VERSION = 'rules-1';

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

function tokenizeRaw(sentence: string): string[] {
  return sentence.replace(/[‘’]/g, "'").match(WORD_RE) ?? [];
}

/** Tokenise into lowercase word tokens (letters and apostrophes), punctuation removed. */
export function tokenize(sentence: string): string[] {
  return tokenizeRaw(sentence).map((t) => t.toLowerCase());
}

const VOWELS = 'aeiou';

/** All accepted forms of the target: word, forms[], and regular -s/-es/-ed/-d/-ing/-er/-est/-ly/-ies/-ied variants. */
export function acceptedForms(word: string, forms?: string[]): string[] {
  const w = word.toLowerCase();
  const set = new Set<string>([w]);
  for (const f of forms ?? []) set.add(f.toLowerCase());
  const last = w[w.length - 1];
  const stem = w;
  set.add(w + 's').add(w + 'es').add(w + 'ed').add(w + 'd').add(w + 'ing').add(w + 'er').add(w + 'ers').add(w + 'est').add(w + 'ly').add(w + 'r').add(w + 'st');
  if (last === 'e') {
    const b = w.slice(0, -1);
    set.add(b + 'ing').add(b + 'ed').add(b + 'er').add(b + 'ers');
    if (w.endsWith('le')) set.add(b + 'y'); // gentle -> gently
  }
  if (last === 'y' && w.length > 2) {
    const b = w.slice(0, -1);
    set.add(b + 'ies').add(b + 'ied').add(b + 'ier').add(b + 'iest').add(b + 'ily').add(b + 'iness');
  }
  if (w.endsWith('ful')) set.add(w + 'ly');
  if (w.endsWith('ic')) set.add(w + 'ally');
  // consonant doubling (run -> running, big -> bigger, stop -> stopped)
  const n = w.length;
  if (n >= 3 && !VOWELS.includes(last) && !'wxy'.includes(last) && VOWELS.includes(w[n - 2]) && !VOWELS.includes(w[n - 3])) {
    const d = stem + last;
    set.add(d + 'ed').add(d + 'ing').add(d + 'er').add(d + 'est').add(d + 'y');
  }
  if (/(s|x|z|ch|sh)$/.test(w)) set.add(w + 'es');
  return [...set];
}

/** Token-set Jaccard similarity (0..1). */
export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function containsDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}

// --------------------------------------------------------------------------- helpers
/** Crude stem used to match context words ("saved" ~ "save", "soldiers" ~ "soldier"). */
function stem(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && s.endsWith('ied')) s = s.slice(0, -3) + 'y';
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  else if (s.length > 4 && s.endsWith('ly')) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  if (s.length > 3 && s[s.length - 1] === s[s.length - 2] && !VOWELS.includes(s[s.length - 1])) s = s.slice(0, -1);
  return s;
}

const DETERMINERS = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'some', 'many', 'one', 'two', 'three', 'no', 'every', 'each', 'another', 'any', 'all', 'such']);
const COPULA_DEGREE = new Set(['is', 'was', 'are', 'were', 'am', 'be', 'been', 'being', 'very', 'so', 'too', 'quite', 'really', 'looks', 'look', 'looked', 'feel', 'feels', 'felt', 'seem', 'seems', 'seemed', 'become', 'became', 'becomes', 'more', 'most', 'not', 'also', 'always', 'still', 'extremely', 'rather']);
const PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'who', 'which', 'that']);
const MODAL_LIKE = new Set(['to', 'will', 'can', 'could', 'would', 'should', 'must', 'may', 'might', 'did', 'does', 'do', "don't", "didn't", "doesn't", "can't", "won't", 'not', 'never', 'always', 'also', 'often', 'let', 'and', 'then']);
const NOT_NOUNISH = new Set(['is', 'was', 'are', 'were', 'am', 'be', 'and', 'but', 'or', 'because', 'so', 'when', 'while', 'if', 'to', 'of', 'in', 'on', 'at', 'with', 'for', 'by']);

/** Is the target word in a plausible slot for its part of speech? */
function plausibleSlot(tokens: string[], idx: number, pos: string): boolean {
  const prev = tokens[idx - 1];
  const prev2 = tokens[idx - 2];
  const next = tokens[idx + 1];
  switch (pos) {
    case 'adjective':
      if (prev !== undefined && (COPULA_DEGREE.has(prev) || DETERMINERS.has(prev))) return true;
      if (prev === undefined && next !== undefined && !NOT_NOUNISH.has(next)) return true;
      return next !== undefined && !NOT_NOUNISH.has(next) && !PRONOUNS.has(next) && !isVerbForm(next) && isLexiconWord(next);
    case 'noun':
      if (prev !== undefined && (DETERMINERS.has(prev) || (prev2 !== undefined && DETERMINERS.has(prev2)))) return true;
      if (prev !== undefined && ['of', 'in', 'on', 'at', 'with', 'for', 'from', 'by', 'to', 'about'].includes(prev)) return true;
      return idx === 0 || prev === undefined;
    case 'verb':
      // imperative "Whisper to me." or gerund "Running is fun."
      if (prev === undefined) return tokens.length >= 2 && (tokens[idx].endsWith('ing') || (next !== undefined && !COPULA_DEGREE.has(next)));
      if (COPULA_DEGREE.has(prev) && tokens[idx].endsWith('ing')) return true; // "He is running."
      if (PRONOUNS.has(prev) || MODAL_LIKE.has(prev)) return true;
      return !DETERMINERS.has(prev) && !COPULA_DEGREE.has(prev) && !NOT_NOUNISH.has(prev) && prev !== 'very';
    case 'adverb':
      return (prev !== undefined && (isVerbForm(prev) || COPULA_DEGREE.has(prev))) || (next !== undefined && (isVerbForm(next) || COPULA_DEGREE.has(next))) || idx === tokens.length - 1;
    case 'preposition':
      return idx > 0 && idx < tokens.length - 1;
    case 'conjunction':
      return idx > 0 && idx < tokens.length - 1;
    default:
      return true; // pronoun, interjection
  }
}

function fb(key: FeedbackItem['key'], ok: boolean, message: string): FeedbackItem {
  return { key, ok, message };
}

function gateResult(gate: SentenceGate, word: string): SentenceEvaluation {
  const rubric: Rubric = { use: 0, grammar: 0, relevance: 0, length: 0 };
  let errorCodes: SentenceErrorCode[] = [];
  let feedback: FeedbackItem[] = [];
  if (gate === 'empty') feedback = [fb('too_short', false, 'Write your sentence first.')];
  else if (gate === 'devanagari') { errorCodes = ['SN_NON_ENGLISH']; feedback = [fb('english_letters', false, 'Please write in English letters.')]; }
  else if (gate === 'blocked') { errorCodes = ['SN_FLAGGED']; feedback = [fb('blocked', false, 'Please try a different sentence.')]; }
  else if (gate === 'word_missing') { errorCodes = ['SN_WORD_MISSING']; feedback = [fb('word_missing', false, `Use the word "${word}" in your sentence.`)]; }
  return { gate, rubric, rawTotal: 0, errorCodes, confidence: 1, feedback, evaluator: RULE_EVALUATOR_VERSION };
}

/**
 * Evaluate a child's sentence.
 * Example (PRD 7.6 A): ('The brave soldier saved the village.', brave)
 *   -> gate 'ok', rubric {use:10, grammar:10, relevance:12, length:4}, rawTotal 36
 */
export function evaluateSentenceRules(sentence: string, word: SentenceWordContext): SentenceEvaluation {
  const text = (sentence ?? '').trim();
  const target = word.word.toLowerCase();
  if (text === '') return gateResult('empty', target);
  if (containsDevanagari(text)) return gateResult('devanagari', target);
  if (!moderateSentence(text).ok) return gateResult('blocked', target);
  const raw = tokenizeRaw(text);
  const tokens = raw.map((t) => t.toLowerCase());
  if (tokens.length === 0) return gateResult('empty', target);

  // ---- R1: use of the word (gate)
  const forms = new Set(acceptedForms(target, word.forms));
  let idx = tokens.findIndex((t) => forms.has(t));
  let use = 10;
  if (idx < 0) {
    use = 0;
    if (target.length >= 5) idx = tokens.findIndex((t) => Math.abs(t.length - target.length) <= 1 && damerauLevenshtein(t, target) === 1);
    if (idx >= 0) use = 5;
    else return gateResult('word_missing', target);
  }
  const errorCodes: SentenceErrorCode[] = [];
  const feedback: FeedbackItem[] = [];
  let confidence = 0.9;
  if (use === 5) {
    errorCodes.push('SN_WORD_MISSPELT');
    feedback.push(fb('word_misspelt', false, `Check the spelling of ${target}.`));
    confidence = 0.8;
  } else feedback.push(fb('used_word', true, 'You used the word!'));

  // ---- R2: grammar and mechanics
  let grammar = 0;
  const hasCapital = /^[A-Z]/.test(text);
  const hasStop = /[.!?]["')”]*$/.test(text);
  if (hasCapital) grammar += 2; else errorCodes.push('SN_CAPITAL');
  if (hasStop) grammar += 2; else errorCodes.push('SN_PUNCT');
  let real = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const properName = i > 0 && /^[A-Z]/.test(raw[i]);
    if (forms.has(t) || isLexiconWord(t) || properName || i === idx) real++;
  }
  const ratio = real / tokens.length;
  if (ratio >= 0.8) grammar += 4; else if (ratio >= 0.6) grammar += 2; else errorCodes.push('SN_NON_ENGLISH');
  const hasVerb = tokens.some((t) => isVerbForm(t)) || (word.partOfSpeech === 'verb' && idx >= 0);
  if (hasVerb) grammar += 2; else errorCodes.push('SN_NO_VERB');
  const counts = new Map<string, number>();
  let repeated = false;
  for (const t of tokens) {
    const c = (counts.get(t) ?? 0) + 1;
    counts.set(t, c);
    if (c >= 3) repeated = true;
  }
  if (repeated) grammar -= 2;
  grammar = Math.max(0, Math.min(SCORING.sentence.rubricMax.grammar, grammar));
  feedback.push(fb('capital', hasCapital, hasCapital ? 'Great, a capital letter!' : 'Start with a capital letter.'));
  feedback.push(fb('full_stop', hasStop, hasStop ? 'Nice full stop at the end!' : 'End with a full stop.'));
  feedback.push(fb('real_words', ratio >= 0.8, ratio >= 0.8 ? 'All real English words!' : 'Check the spelling of some words.'));
  feedback.push(fb('has_verb', hasVerb, hasVerb ? 'You used an action word!' : 'Add an action word.'));

  // ---- copy detection
  const exTokens = tokenize(word.exampleSentence ?? '');
  const copied = exTokens.length > 0 && jaccard(tokens, exTokens) >= SCORING.sentence.copyJaccard;

  // ---- R3: relevance
  let relevance: number;
  if (copied) {
    relevance = 0;
    errorCodes.push('SN_COPIED');
    confidence = Math.min(confidence, 0.7);
  } else {
    const ctxStems = new Set((word.contextWords ?? []).map((c) => stem(c.toLowerCase())));
    const hit = tokens.some((t, i) => i !== idx && ctxStems.has(stem(t)));
    if (hit) relevance = 12;
    else if (plausibleSlot(tokens, idx, word.partOfSpeech)) { relevance = 8; confidence = Math.min(confidence, 0.7); }
    else {
      relevance = 6;
      confidence = Math.min(confidence, 0.5);
      errorCodes.push('SN_WRONG_FORM');
    }
    if (relevance <= 6) errorCodes.push('SN_IRRELEVANT');
  }

  // ---- R4: length and complexity
  const n = tokens.length;
  let length = 0;
  let hasConj = false;
  if (copied) {
    length = 0;
  } else {
    length = n < 4 ? 0 : n <= 5 ? 2 : n <= 8 ? 4 : 6;
    hasConj = tokens.some((t) => (SCORING.sentence.conjunctions as readonly string[]).includes(t));
    if (hasConj && n >= 6) length += 2;
    length = Math.min(SCORING.sentence.rubricMax.length, length);
    if (length === 0) errorCodes.push('SN_TOO_SHORT');
  }
  if (copied) {
    feedback.push(fb('copied', false, 'Try writing your own idea!'));
  } else {
    feedback.push(n >= 6 ? fb('long_enough', true, 'Nice long sentence!') : fb('too_short', false, 'Try adding more words.'));
    feedback.push(hasConj && n >= 6 ? fb('joining_word', true, 'Great joining word!') : fb('joining_word', false, 'Try a joining word like because.'));
  }

  const rubric: Rubric = { use, grammar, relevance, length };
  return {
    gate: 'ok',
    rubric,
    rawTotal: use + grammar + relevance + length,
    errorCodes,
    confidence,
    feedback,
    evaluator: RULE_EVALUATOR_VERSION,
  };
}
