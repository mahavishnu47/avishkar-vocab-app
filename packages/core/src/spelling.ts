/**
 * Spelling error classifier (PRD 9.1). OWNER: Lane B (core logic).
 * Normalise (trim, lowercase) -> Damerau-Levenshtein with op trace -> rule checks.
 * Must run < 2 ms per call. Small built-in homophone + common-word lists live in
 * packages/core/src/data/ (Lane B creates them).
 */
import { SPELLING_PRIMARY_PRIORITY } from './taxonomy.ts';
import type { SpellingErrorCode } from './taxonomy.ts';
import type { SpellingClassification } from './types.ts';
import { isLexiconWord } from './data/common-words.ts';
import { isHomophonePair } from './data/homophones.ts';

/** trim + lowercase + collapse inner whitespace. Case-insensitive comparison everywhere. */
export function normalizeSpelling(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ------------------------------------------------------------------ edit distance with trace
type OpType = 'sub' | 'del' | 'ins' | 'trans';
interface Op {
  type: OpType;
  /** index in target (sub/del/trans: position of the target char; ins: position in target before which it was inserted) */
  ti: number;
  /** index in attempt (sub/ins/trans) or -1 for del */
  ai: number;
}

function buildMatrix(t: string, a: string): number[][] {
  const n = t.length;
  const m = a.length;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const row = new Array<number>(m + 1);
    row[0] = i;
    d.push(row);
  }
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = t.charCodeAt(i - 1) === a.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && t[i - 1] === a[j - 2] && t[i - 2] === a[j - 1] && t[i - 1] !== t[i - 2]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
    }
  }
  return d;
}

/** Optimal-string-alignment Damerau-Levenshtein distance. */
export function damerauLevenshtein(a: string, b: string): number {
  return buildMatrix(a, b)[a.length][b.length];
}

/** Edit operations turning target `t` into attempt `a` (one optimal alignment). */
function traceOps(t: string, a: string, d: number[][]): Op[] {
  const ops: Op[] = [];
  let i = t.length;
  let j = a.length;
  while (i > 0 || j > 0) {
    const cur = d[i][j];
    if (i > 0 && j > 0 && t[i - 1] === a[j - 1] && cur === d[i - 1][j - 1]) {
      i--; j--;
    } else if (i > 1 && j > 1 && t[i - 1] === a[j - 2] && t[i - 2] === a[j - 1] && t[i - 1] !== t[i - 2] && cur === d[i - 2][j - 2] + 1) {
      ops.push({ type: 'trans', ti: i - 2, ai: j - 2 });
      i -= 2; j -= 2;
    } else if (i > 0 && j > 0 && cur === d[i - 1][j - 1] + 1) {
      ops.push({ type: 'sub', ti: i - 1, ai: j - 1 });
      i--; j--;
    } else if (i > 0 && cur === d[i - 1][j] + 1) {
      ops.push({ type: 'del', ti: i - 1, ai: -1 });
      i--;
    } else {
      ops.push({ type: 'ins', ti: i, ai: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

// ------------------------------------------------------------------ letter classes
const isVowel = (c: string | undefined): boolean => c !== undefined && 'aeiou'.includes(c);
const isConsonantCh = (c: string | undefined): boolean => c !== undefined && c >= 'a' && c <= 'z' && !isVowel(c);

/** y behaves as a vowel when swapped with i/e (happy/happi). */
function bothVowelish(x: string, y: string): boolean {
  if (isVowel(x) && isVowel(y)) return true;
  const pair = x + y;
  return pair === 'yi' || pair === 'iy' || pair === 'ye' || pair === 'ey';
}

/** Consonant swaps that sound alike in English (c/k, c/s, s/z, k/q, g/j, f/v...). */
const PHONETIC_SUBS = new Set(['ck', 'kc', 'cs', 'sc', 'sz', 'zs', 'kq', 'qk', 'gj', 'jg', 'cq', 'qc', 'xk', 'kx', 'xs', 'sx']);

// ------------------------------------------------------------------ simplified Metaphone
/** Simplified Metaphone key. Vowels are dropped except at the start. D stays D (not T) so d/t slips are SUBST. */
export function phoneticKey(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  if (/^(kn|gn|pn|wr|ps)/.test(w)) w = w.slice(1);
  else if (w.startsWith('wh')) w = 'w' + w.slice(2);
  else if (w.startsWith('x')) w = 's' + w.slice(1);
  let out = '';
  const n = w.length;
  for (let i = 0; i < n; i++) {
    const c = w[i];
    const p = w[i - 1];
    const nx = w[i + 1];
    const nx2 = w[i + 2];
    if (c === p && c !== 'c') continue;
    switch (c) {
      case 'a': case 'e': case 'i': case 'o': case 'u':
        if (i === 0) out += 'A';
        break;
      case 'b':
        if (!(p === 'm' && i === n - 1)) out += 'B';
        break;
      case 'c':
        if (nx === 'i' && nx2 === 'a') out += 'X';
        else if (nx === 'h') { out += 'X'; i++; }
        else if (p === 's' && (nx === 'e' || nx === 'i' || nx === 'y')) { /* silent c in sc(e|i|y) */ }
        else if (nx === 'e' || nx === 'i' || nx === 'y') out += 'S';
        else out += 'K';
        break;
      case 'd':
        if (nx === 'g' && (nx2 === 'e' || nx2 === 'y' || nx2 === 'i')) { out += 'J'; i++; }
        else out += 'D';
        break;
      case 'g':
        if (nx === 'h') {
          if (i + 2 >= n || !isVowel(nx2)) { i++; break; }
          out += 'K'; i++; break;
        }
        if (nx === 'n' && (i + 2 === n || (nx2 === 'e' && i + 3 === n))) break;
        if (nx === 'e' || nx === 'i' || nx === 'y') out += 'J';
        else out += 'K';
        break;
      case 'h':
        if (isVowel(nx) && !'csptg'.includes(p ?? '')) out += 'H';
        break;
      case 'k':
        if (p !== 'c') out += 'K';
        break;
      case 'p':
        if (nx === 'h') { out += 'F'; i++; } else out += 'P';
        break;
      case 'q': out += 'K'; break;
      case 's':
        if (nx === 'h') { out += 'X'; i++; }
        else if (nx === 'i' && (nx2 === 'o' || nx2 === 'a')) out += 'X';
        else out += 'S';
        break;
      case 't':
        if (nx === 'i' && (nx2 === 'o' || nx2 === 'a')) out += 'X';
        else if (nx === 'h') { out += '0'; i++; }
        else if (nx === 'c' && nx2 === 'h') { /* tch: skip t */ }
        else out += 'T';
        break;
      case 'v': out += 'F'; break;
      case 'w':
        if (isVowel(nx)) out += 'W';
        break;
      case 'x': out += 'KS'; break;
      case 'y':
        if (isVowel(nx)) out += 'Y';
        break;
      case 'z': out += 'S'; break;
      default: out += c.toUpperCase(); // f j l m n r
    }
  }
  return out;
}

/** Marathi/Hindi transfer canonical form: ph->f, sh->s, v->w, z->j. */
function l1Canon(s: string): string {
  return s.replace(/ph/g, 'f').replace(/sh/g, 's').replace(/v/g, 'w').replace(/z/g, 'j');
}

// ------------------------------------------------------------------ per-op categorisation
function isSilentDeletion(t: string, i: number): boolean {
  const c = t[i];
  const p = t[i - 1];
  const nx = t[i + 1];
  const last = i === t.length - 1;
  if (i === 1 && p === 'w' && c === 'h') return true; // wh
  if (i === 0 && c === 'w' && (nx === 'h' || nx === 'r')) return true; // wh / wr
  if (i === 0 && c === 'k' && nx === 'n') return true; // kn
  if (i === 0 && c === 'g' && nx === 'n') return true; // gn
  if (c === 'g' && nx === 'n' && i + 2 <= t.length) return true; // sign, foreign
  if (i === 0 && c === 'p' && nx === 's') return true; // ps
  if (i === 0 && c === 'p' && nx === 'n') return true; // pn
  if (c === 'b' && p === 'm' && (last || (nx === 'e' && i === t.length - 2))) return true; // -mb
  if (c === 'b' && nx === 't') return true; // doubt, debt
  if ((c === 'g' && nx === 'h') || (c === 'h' && p === 'g' && i > 1)) return true; // -gh
  if (c === 'e' && last && i > 1 && isConsonantCh(p)) return true; // final -e
  if (c === 'l' && (nx === 'k' || nx === 'm' || nx === 'f') && isVowel(p)) return true; // walk, calm
  if (c === 't' && p === 's' && (nx === 'l' || (nx === 'e' && t[i + 2] === 'n'))) return true; // castle, listen
  if (c === 'c' && p === 's' && (nx === 'i' || nx === 'e')) return true; // science, scene
  if (c === 'w' && p === 's' && nx === 'e') return true; // answer
  if (c === 'h' && i === 0 && (t.startsWith('hon') || t.startsWith('hou') || t.startsWith('heir'))) return true; // hour, honest
  if (c === 'u' && (p === 'g') && isVowel(nx)) return true; // guess, guard
  return false;
}

type OpCat = SpellingErrorCode;

function categorise(op: Op, t: string, a: string): OpCat {
  if (op.type === 'trans') return 'SP_TRANSPOSE';
  if (op.type === 'del') {
    const c = t[op.ti];
    if (isSilentDeletion(t, op.ti)) return 'SP_SILENT';
    if (isConsonantCh(c) && (t[op.ti - 1] === c || t[op.ti + 1] === c)) return 'SP_DOUBLE';
    if (isVowel(c)) {
      // dropped schwa: an inner single vowel between two consonants
      if (isConsonantCh(t[op.ti - 1]) && isConsonantCh(t[op.ti + 1]) && t.length >= 5) return 'SP_L1';
      return 'SP_VOWEL';
    }
    return 'SP_OMISSION';
  }
  if (op.type === 'ins') {
    const c = a[op.ai];
    if (isVowel(c)) return 'SP_VOWEL';
    if (isConsonantCh(c) && (a[op.ai - 1] === c || a[op.ai + 1] === c)) {
      // doubling a consonant between vowels (begin -> beggin) is a double-letter slip; doubling after a consonant is just extra
      const run = a[op.ai - 1] === c ? op.ai - 1 : op.ai;
      if (isVowel(a[run - 1]) && isVowel(a[run + 2])) return 'SP_DOUBLE';
    }
    return 'SP_INSERTION';
  }
  // sub
  const x = t[op.ti];
  const y = a[op.ai];
  if (bothVowelish(x, y)) return 'SP_VOWEL';
  if (PHONETIC_SUBS.has(x + y)) return 'SP_PHONETIC';
  return 'SP_SUBST';
}

/**
 * Classify one attempt against the target word.
 * classifySpellingError('whisper','wisper') -> { isCorrect:false, tags:['SP_SILENT', ...], primary:'SP_SILENT', editDistance:1 }
 * classifySpellingError('brave','Brave ')   -> { isCorrect:true, tags:['SP_CORRECT'], primary:'SP_CORRECT', editDistance:0 }
 * classifySpellingError('brave','')         -> { isCorrect:false, tags:['SP_BLANK'], primary:'SP_BLANK', editDistance:5 }
 */
export function classifySpellingError(target: string, attempt: string): SpellingClassification {
  const t = normalizeSpelling(target);
  const a = normalizeSpelling(attempt);
  if (t === a) return { isCorrect: true, tags: ['SP_CORRECT'], primary: 'SP_CORRECT', editDistance: 0 };
  const d = buildMatrix(t, a);
  const dist = d[t.length][a.length];
  if (a.length <= 1) return { isCorrect: false, tags: ['SP_BLANK'], primary: 'SP_BLANK', editDistance: dist };

  const tags = new Set<SpellingErrorCode>();
  if (isHomophonePair(t, a)) tags.add('SP_HOMOPHONE');
  else if (isLexiconWord(a, true)) tags.add('SP_REALWORD');
  if (dist * 2 >= t.length) tags.add('SP_FARMISS');

  const far = tags.has('SP_FARMISS');
  const ops = far ? [] : traceOps(t, a, d);
  const opTags = new Set<SpellingErrorCode>();
  for (const op of ops) opTags.add(categorise(op, t, a));
  for (const c of opTags) tags.add(c);

  if (!far && l1Canon(t) === l1Canon(a)) tags.add('SP_L1');

  const key = phoneticKey(t);
  if (key !== '' && key === phoneticKey(a)) {
    for (const c of opTags) {
      if (c !== 'SP_INSERTION' && c !== 'SP_OMISSION') { tags.add('SP_PHONETIC'); break; }
    }
  }
  // a far miss is not described by its (many) individual slips, so op-level tags are skipped above
  const ordered = SPELLING_PRIMARY_PRIORITY.filter((c) => tags.has(c));
  const primary = ordered[0] ?? 'SP_SUBST';
  return { isCorrect: false, tags: ordered.length ? ordered : [primary], primary, editDistance: dist };
}

/**
 * Feedback helper for the Stage 1 "green letters" after wrong attempt #2:
 * for each position of target, true if attempt has the same letter at that index.
 */
export function correctPositions(target: string, attempt: string): boolean[] {
  const t = normalizeSpelling(target);
  const a = normalizeSpelling(attempt);
  const out: boolean[] = [];
  for (let i = 0; i < t.length; i++) out.push(a[i] === t[i]);
  return out;
}
