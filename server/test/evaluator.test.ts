import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateSentenceRules, type Word } from '@shabd/core';
import { evaluateSentence } from '../src/services/sentenceEvaluator.ts';
import * as claude from '../src/services/claudeEvaluator.ts';

const word: Word = {
  id: 'd001-1', dayIndex: 1, word: 'kitchen', partOfSpeech: 'noun', difficulty: 1, meaning: 'a room where food is cooked', meaningMarathi: 'x',
  exampleSentence: 'Aai makes hot bhakri in the kitchen every morning.', distractorMeanings: ['a', 'b'], syllables: ['kit', 'chen'], tags: [],
  contextWords: ['cook', 'food', 'mother'], forms: [], source: 'bank',
};
const text = 'My mother cooks food in the kitchen.';

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); delete process.env.ANTHROPIC_API_KEY; });

describe('sentenceEvaluator', () => {
  it('returns the rules result without a key', async () => {
    expect(await evaluateSentence(text, word)).toEqual(evaluateSentenceRules(text, word));
  });
  it('falls back to rules when Claude throws (stub not implemented yet)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    expect(await evaluateSentence(text, word)).toEqual(evaluateSentenceRules(text, word));
  });
  it('uses Claude when it works, and never sends gated text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const spy = vi.spyOn(claude, 'evaluateWithClaude').mockImplementation(async (_t, _w, rules) => ({ ...rules, evaluator: 'claude:test', tip: 'Nice!' }));
    expect((await evaluateSentence(text, word)).evaluator).toBe('claude:test');
    expect((await evaluateSentence('', word)).gate).toBe('empty');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
