/**
 * Scoring engine (PRD 7, simplified). OWNER: Lane B (core logic).
 * Pure functions, no I/O. Must reproduce the worked examples in docs/BUILD_PLAN.md (B1).
 */
import { SCORING } from './scoring.config.ts';
import type { SpellingScoreInput, SentenceScoreInput, WordScore } from './types.ts';

/**
 * Stage 1 marks: max(0, round(40 * m[attempt]) - sum(hintCost)).
 * correctOnAttempt null -> 0. Duplicate hints count once.
 * e.g. {correctOnAttempt:2, hints:['first_letter']} -> round(40*0.6)-6 = 18
 */
export function scoreSpelling(input: SpellingScoreInput): number {
  if (input.correctOnAttempt === null) return 0;
  const base = Math.round(SCORING.spelling.max * SCORING.spelling.attemptMultipliers[input.correctOnAttempt - 1]);
  let cost = 0;
  for (const h of new Set(input.hints)) cost += SCORING.spelling.hintCost[h] ?? 0;
  return Math.max(0, base - cost);
}

/** Stage 2 marks: 1 -> 20, 2 -> 8, null (wrong twice) -> 0. */
export function scoreMeaning(correctOnAttempt: 1 | 2 | null): number {
  if (correctOnAttempt === null) return 0;
  return SCORING.meaning.marksByAttempt[correctOnAttempt - 1];
}

/**
 * Final marks for ONE scored sentence submission:
 * max(0, round(sum(rubric) * mult[submissionNo]) - (starterHintUsed ? 5 : 0)).
 */
export function scoreSentenceSubmission(input: SentenceScoreInput): number {
  const r = input.rubric;
  const sum = r.use + r.grammar + r.relevance + r.length;
  const mult = SCORING.sentence.submissionMultipliers[input.submissionNo - 1] ?? 1;
  const hint = input.starterHintUsed ? SCORING.sentence.starterHintCost : 0;
  return Math.max(0, Math.round(sum * mult) - hint);
}

/** Stage 3 marks: best of the scored submissions (0 if none). Retrying never lowers the score. */
export function scoreSentence(submissions: SentenceScoreInput[]): number {
  let best = 0;
  for (const s of submissions) best = Math.max(best, scoreSentenceSubmission(s));
  return Math.min(best, SCORING.sentence.max);
}

/** 0..3 stars from a 0..100 total using SCORING.starThresholds. */
export function starsFor(total: number): 0 | 1 | 2 | 3 {
  const [t3, t2, t1] = SCORING.starThresholds;
  if (total >= t3) return 3;
  if (total >= t2) return 2;
  if (total >= t1) return 1;
  return 0;
}

/** Combine the three stage marks into a WordScore (clamps each stage to its max). */
export function scoreWord(wordId: string, spelling: number, meaning: number, sentence: number): WordScore {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const sp = clamp(spelling, SCORING.spelling.max);
  const mn = clamp(meaning, SCORING.meaning.max);
  const sn = clamp(sentence, SCORING.sentence.max);
  const total = sp + mn + sn;
  return { wordId, spelling: sp, meaning: mn, sentence: sn, total, stars: starsFor(total) };
}
