import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateSentenceRules, type Word } from '@shabd/core';

const create = vi.fn();
const ctorArgs: unknown[] = [];
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
    constructor(opts: unknown) { ctorArgs.push(opts); }
  },
}));

import { claudeEnabled, evaluateWithClaude } from '../src/services/claudeEvaluator.ts';
import { evaluateSentence } from '../src/services/sentenceEvaluator.ts';

const word: Word = {
  id: 'd001-1', dayIndex: 1, word: 'kitchen', partOfSpeech: 'noun', difficulty: 1, meaning: 'a room where food is cooked', meaningMarathi: 'x',
  exampleSentence: 'Aai makes hot bhakri in the kitchen every morning.', distractorMeanings: ['a', 'b'], syllables: ['kit', 'chen'], tags: [],
  contextWords: ['cook', 'food', 'mother'], forms: [], source: 'bank',
};
const text = 'My mother cooks food in the kitchen.';
const reply = (obj: unknown, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] });

beforeEach(() => {
  create.mockReset(); ctorArgs.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.CLAUDE_MODEL;
});
afterEach(() => { vi.restoreAllMocks(); delete process.env.ANTHROPIC_API_KEY; delete process.env.CLAUDE_MODEL; });

describe('claudeEvaluator', () => {
  it('maps a valid response, clamps, keeps R1 from rules, sends only word + sentence', async () => {
    const rules = evaluateSentenceRules(text, word);
    create.mockResolvedValue(reply({ use: 0, grammar: 99, relevance: 50, length: -3, errorCodes: ['SN_PUNCT', 'BOGUS', 'SN_COPIED'], tip: 'Great job! Try adding because to join two ideas together in one long sentence today.' }));
    const r = await evaluateWithClaude(text, word, rules);
    expect(r.evaluator).toBe('claude:claude-haiku-5-5');
    expect(r.rubric).toEqual({ use: rules.rubric.use, grammar: 10, relevance: 12, length: 0 });
    expect(r.rawTotal).toBe(rules.rubric.use + 22);
    expect(r.errorCodes).toContain('SN_PUNCT');
    expect(r.errorCodes).not.toContain('SN_COPIED');
    expect(r.tip!.split(' ').length).toBeLessThanOrEqual(15);
    expect(r.feedback).toEqual(rules.feedback);
    const body = JSON.stringify(create.mock.calls[0][0]);
    expect(body).toContain('kitchen');
    expect(body).toContain(text);
    expect(body).not.toContain('bhakri'); // example sentence not sent
  });

  it('zeroes R3/R4 when rules say copied; honours CLAUDE_MODEL', async () => {
    process.env.CLAUDE_MODEL = 'm-x';
    const rules = { ...evaluateSentenceRules(text, word), errorCodes: ['SN_COPIED' as const] };
    create.mockResolvedValue(reply({ use: 10, grammar: 8, relevance: 12, length: 8, errorCodes: [], tip: 'Try your own idea!' }));
    const r = await evaluateWithClaude(text, word, rules);
    expect(r.rubric.relevance).toBe(0);
    expect(r.rubric.length).toBe(0);
    expect(r.errorCodes).toContain('SN_COPIED');
    expect(r.evaluator).toBe('claude:m-x');
  });

  it('malformed JSON / refusal throws, and the orchestrator falls back to rules', async () => {
    const rules = evaluateSentenceRules(text, word);
    create.mockResolvedValue(reply('not json {'));
    await expect(evaluateWithClaude(text, word, rules)).rejects.toThrow();
    expect(await evaluateSentence(text, word)).toEqual(rules);
    create.mockResolvedValue(reply({ use: 1 }));
    expect(await evaluateSentence(text, word)).toEqual(rules);
    create.mockResolvedValue(reply({}, 'refusal'));
    expect(await evaluateSentence(text, word)).toEqual(rules);
  });

  it('timeout falls back to rules', async () => {
    const rules = evaluateSentenceRules(text, word);
    create.mockRejectedValue(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }));
    expect(await evaluateSentence(text, word)).toEqual(rules);
  });

  it('is disabled without a key and never calls the SDK', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(claudeEnabled()).toBe(false);
    const rules = evaluateSentenceRules(text, word);
    expect(await evaluateSentence(text, word)).toEqual(rules);
    await expect(evaluateWithClaude(text, word, rules)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
