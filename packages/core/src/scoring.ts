/**
 * Scoring engine (PRD 7, simplified). OWNER: Lane B (core logic).
 * Pure functions, no I/O. Must reproduce the worked examples in docs/BUILD_PLAN.md (B1).
 */
import type { SpellingScoreInput, SentenceScoreInput, WordScore } from './types.ts';

/**
 * Stage 1 marks: max(0, round(40 * m[attempt]) - sum(hintCost)).
 * correctOnAttempt null -> 0. Duplicate hints count once.
 * e.g. {correctOnAttempt:2, hints:['first_letter']} -> round(40*0.6)-6 = 18
 */
export function scoreSpelling(input: SpellingScoreInput): number {
  void input;
  throw new Error('not implemented');
}

/** Stage 2 marks: 1 -> 20, 2 -> 8, null (wrong twice) -> 0. */
export function scoreMeaning(correctOnAttempt: 1 | 2 | null): number {
  void correctOnAttempt;
  throw new Error('not implemented');
}

/**
 * Final marks for ONE scored sentence submission:
 * max(0, round(sum(rubric) * mult[submissionNo]) - (starterHintUsed ? 5 : 0)).
 */
export function scoreSentenceSubmission(input: SentenceScoreInput): number {
  void input;
  throw new Error('not implemented');
}

/** Stage 3 marks: best of the scored submissions (0 if none). Retrying never lowers the score. */
export function scoreSentence(submissions: SentenceScoreInput[]): number {
  void submissions;
  throw new Error('not implemented');
}

/** 0..3 stars from a 0..100 total using SCORING.starThresholds. */
export function starsFor(total: number): 0 | 1 | 2 | 3 {
  void total;
  throw new Error('not implemented');
}

/** Combine the three stage marks into a WordScore (clamps each stage to its max). */
export function scoreWord(wordId: string, spelling: number, meaning: number, sentence: number): WordScore {
  void wordId; void spelling; void meaning; void sentence;
  throw new Error('not implemented');
}
