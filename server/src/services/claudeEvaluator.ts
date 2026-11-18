/**
 * Optional Claude sentence evaluator. OWNER: Wave 2 task W2-2. See docs/BUILD_PLAN.md W2-2 for the spec.
 * - Enabled only when process.env.ANTHROPIC_API_KEY is set. Model: process.env.CLAUDE_MODEL ?? 'claude-opus-5-5'.
 * - Uses the official @anthropic-ai/sdk with structured outputs (JSON rubric), effort 'low', short max_tokens.
 * - Sends ONLY the target word, its POS/meaning, and the child's sentence (no names / ids). Text already
 *   passed moderation (rules gate 'ok').
 * - Returns a SentenceEvaluation with evaluator 'claude:<model>', rubric clamped to SCORING.sentence.rubricMax,
 *   R1 (use) taken from the RULES result (deterministic gate), copy detection from rules (R3=R4=0 if copied),
 *   feedback checklist from rules + a one-line `tip` (<= 15 words, child-friendly, no mention of AI).
 */
import type { SentenceEvaluation, Word } from '@shabd/core';

export function claudeEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function evaluateWithClaude(
  text: string,
  word: Word,
  rules: SentenceEvaluation,
): Promise<SentenceEvaluation> {
  void text; void word; void rules;
  throw new Error('not implemented');
}
