/**
 * Sentence evaluation orchestrator. OWNER: Lane A in Wave 1 (rules only); Wave 2 task W2-2 adds Claude.
 *
 * Flow: rules = evaluateSentenceRules(text, word)
 *   if rules.gate !== 'ok'                 -> return rules (never send gated/blocked text to the AI)
 *   if claudeEnabled()                     -> try evaluateWithClaude(text, word, rules) with a 6 s timeout
 *                                             on ANY error/timeout -> return rules
 *   else                                   -> return rules
 */
import { evaluateSentenceRules, type SentenceEvaluation, type Word } from '@shabd/core';
import { claudeEnabled, evaluateWithClaude } from './claudeEvaluator.ts';

export const CLAUDE_TIMEOUT_MS = 6000;

export async function evaluateSentence(text: string, word: Word): Promise<SentenceEvaluation> {
  const rules = evaluateSentenceRules(text, word);
  if (rules.gate !== 'ok' || !claudeEnabled()) return rules;

  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('claude evaluator timed out')), CLAUDE_TIMEOUT_MS);
    });
    return await Promise.race([evaluateWithClaude(text, word, rules), timeout]);
  } catch (err) {
    console.warn('[sentence] Claude evaluator failed, using rules:', (err as Error).message);
    return rules;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
