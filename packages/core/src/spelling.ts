/**
 * Spelling error classifier (PRD 9.1). OWNER: Lane B (core logic).
 * Normalise (trim, lowercase) -> Damerau-Levenshtein with op trace -> rule checks.
 * Must run < 2 ms per call. Small built-in homophone + common-word lists live in
 * packages/core/src/data/ (Lane B creates them).
 */
import type { SpellingClassification } from './types.ts';

/** trim + lowercase + collapse inner whitespace. Case-insensitive comparison everywhere. */
export function normalizeSpelling(s: string): string {
  void s;
  throw new Error('not implemented');
}

/** Optimal-string-alignment Damerau-Levenshtein distance. */
export function damerauLevenshtein(a: string, b: string): number {
  void a; void b;
  throw new Error('not implemented');
}

/**
 * Classify one attempt against the target word.
 * classifySpellingError('whisper','wisper') -> { isCorrect:false, tags:['SP_SILENT', ...], primary:'SP_SILENT', editDistance:1 }
 * classifySpellingError('brave','Brave ')   -> { isCorrect:true, tags:['SP_CORRECT'], primary:'SP_CORRECT', editDistance:0 }
 * classifySpellingError('brave','')         -> { isCorrect:false, tags:['SP_BLANK'], primary:'SP_BLANK', editDistance:5 }
 */
export function classifySpellingError(target: string, attempt: string): SpellingClassification {
  void target; void attempt;
  throw new Error('not implemented');
}

/**
 * Feedback helper for the Stage 1 "green letters" after wrong attempt #2:
 * for each position of target, true if attempt has the same letter at that index.
 */
export function correctPositions(target: string, attempt: string): boolean[] {
  void target; void attempt;
  throw new Error('not implemented');
}
