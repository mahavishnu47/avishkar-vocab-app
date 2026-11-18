/**
 * Sentence evaluation orchestrator. OWNER: Lane A in Wave 1 (rules only); Wave 2 task W2-2 adds Claude.
 *
 * Flow: rules = evaluateSentenceRules(text, word)
 *   if rules.gate !== 'ok'                 -> return rules (never send gated/blocked text to the AI)
 *   if claudeEnabled()                     -> try evaluateWithClaude(text, word, rules) with a 6 s timeout
 *                                             on ANY error/timeout -> return rules
 *   else                                   -> return rules
 */
import type { SentenceEvaluation, Word } from '@shabd/core';

export async function evaluateSentence(text: string, word: Word): Promise<SentenceEvaluation> {
  void text; void word;
  throw new Error('not implemented');
}
