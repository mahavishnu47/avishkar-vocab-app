/**
 * Rule-based sentence evaluator (PRD 8.2 rule table). OWNER: Lane B (core logic).
 * Deterministic, offline, < 20 ms. Runs on the client (instant feedback, offline queue)
 * AND on the server (authoritative; server may replace it with the Claude evaluator,
 * falling back to this on any error / no API key).
 *
 * Gate order: empty -> devanagari -> blocked (moderation) -> word_missing -> scored ('ok').
 * Non-'ok' gates return a zero rubric and do NOT count as a submission.
 */
import type { SentenceEvaluation, SentenceWordContext } from './types.ts';

export const RULE_EVALUATOR_VERSION = 'rules-1';

/** Tokenise into lowercase word tokens (letters and apostrophes), punctuation removed. */
export function tokenize(sentence: string): string[] {
  void sentence;
  throw new Error('not implemented');
}

/** All accepted forms of the target: word, forms[], and regular -s/-es/-ed/-d/-ing/-er/-est/-ly/-ies/-ied variants. */
export function acceptedForms(word: string, forms?: string[]): string[] {
  void word; void forms;
  throw new Error('not implemented');
}

/** Token-set Jaccard similarity (0..1). */
export function jaccard(a: string[], b: string[]): number {
  void a; void b;
  throw new Error('not implemented');
}

export function containsDevanagari(text: string): boolean {
  void text;
  throw new Error('not implemented');
}

/**
 * Evaluate a child's sentence.
 * Example (PRD 7.6 A): ('The brave soldier saved the village.', brave)
 *   -> gate 'ok', rubric {use:10, grammar:10, relevance:12, length:4}, rawTotal 36
 */
export function evaluateSentenceRules(sentence: string, word: SentenceWordContext): SentenceEvaluation {
  void sentence; void word;
  throw new Error('not implemented');
}
