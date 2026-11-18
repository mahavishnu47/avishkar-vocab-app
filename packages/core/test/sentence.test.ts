import { describe, expect, it } from 'vitest';
import { acceptedForms, containsDevanagari, evaluateSentenceRules, jaccard, tokenize, RULE_EVALUATOR_VERSION } from '../src/index.ts';
import type { SentenceWordContext } from '../src/index.ts';
import fixture from './fixtures/sentences.json';

interface Case { word: string; text: string; gate: string; rubric?: { use: number; grammar: number; relevance: number; length: number }; codes?: string[]; notCodes?: string[]; note?: string }
const words = fixture.words as unknown as Record<string, SentenceWordContext>;
const cases = fixture.cases as unknown as Case[];

describe('helpers', () => {
  it('tokenize', () => {
    expect(tokenize("The boy's  dog, it's BIG!")).toEqual(['the', "boy's", 'dog', "it's", 'big']);
    expect(tokenize('')).toEqual([]);
    expect(tokenize('123 ...')).toEqual([]);
  });
  it('acceptedForms', () => {
    const b = acceptedForms('brave');
    for (const f of ['brave', 'braver', 'bravest', 'bravely', 'braving', 'braved', 'braves']) expect(b).toContain(f);
    const r = acceptedForms('run', ['ran']);
    for (const f of ['run', 'ran', 'running', 'runs', 'runner']) expect(r).toContain(f);
    const c = acceptedForms('carry');
    for (const f of ['carries', 'carried', 'carrying']) expect(c).toContain(f);
    expect(acceptedForms('Whisper')).toContain('whispered');
    expect(acceptedForms('protect')).toContain('protecting');
  });
  it('jaccard', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a', 'b'], ['c'])).toBe(0);
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5);
    expect(jaccard([], [])).toBe(1);
  });
  it('containsDevanagari', () => {
    expect(containsDevanagari('hello')).toBe(false);
    expect(containsDevanagari('hello शब्द')).toBe(true);
  });
});

describe('evaluateSentenceRules: fixture', () => {
  it('has at least 40 cases', () => expect(cases.length).toBeGreaterThanOrEqual(40));
  for (const c of cases) {
    it(`${c.word}: ${JSON.stringify(c.text)}`, () => {
      const r = evaluateSentenceRules(c.text, words[c.word]);
      expect(r.gate).toBe(c.gate);
      expect(r.evaluator).toBe(RULE_EVALUATOR_VERSION);
      const sum = r.rubric.use + r.rubric.grammar + r.rubric.relevance + r.rubric.length;
      expect(r.rawTotal).toBe(sum);
      if (c.gate !== 'ok') expect(sum).toBe(0);
      if (c.rubric) expect(r.rubric).toEqual(c.rubric);
      for (const code of c.codes ?? []) expect(r.errorCodes).toContain(code);
      for (const code of c.notCodes ?? []) expect(r.errorCodes).not.toContain(code);
      expect(r.rubric.use).toBeLessThanOrEqual(10);
      expect(r.rubric.grammar).toBeLessThanOrEqual(10);
      expect(r.rubric.relevance).toBeLessThanOrEqual(12);
      expect(r.rubric.length).toBeLessThanOrEqual(8);
      expect(r.rubric.grammar).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(r.feedback.length).toBeGreaterThan(0);
      for (const f of r.feedback) expect(f.message.split(/\s+/).length, f.message).toBeLessThanOrEqual(8);
    });
  }
});

describe('evaluateSentenceRules: behaviour', () => {
  const brave = words.brave;
  it('PRD examples A/B/C', () => {
    expect(evaluateSentenceRules('The brave soldier saved the village.', brave).rawTotal).toBe(36);
    expect(evaluateSentenceRules('elephant is enormous', words.enormous).rawTotal).toBe(28);
    const c1 = evaluateSentenceRules('The girl whispered a secret to her friend.', words.whisper);
    expect(c1.errorCodes).toContain('SN_COPIED');
    expect(c1.rubric.relevance).toBe(0);
    expect(c1.rubric.length).toBe(0);
    expect(evaluateSentenceRules('I whisper to my friend because the teacher is teaching.', words.whisper).rawTotal).toBe(40);
  });
  it('misspelt target gives use 5 with feedback', () => {
    const r = evaluateSentenceRules('The bravve soldier saved us.', brave);
    expect(r.rubric.use).toBe(5);
    expect(r.errorCodes).toContain('SN_WORD_MISSPELT');
    expect(r.feedback.find((f) => f.key === 'word_misspelt')?.ok).toBe(false);
  });
  it('short words are not fuzzy-matched', () => {
    const r = evaluateSentenceRules('The cap fell down.', { ...words.run, word: 'cat' });
    expect(r.gate).toBe('word_missing');
  });
  it('gates do not carry rubric marks and give a child message', () => {
    const r = evaluateSentenceRules('The soldier fought hard.', brave);
    expect(r.gate).toBe('word_missing');
    expect(r.feedback[0]).toMatchObject({ key: 'word_missing', ok: false });
    expect(r.feedback[0].message).toContain('brave');
    expect(evaluateSentenceRules('बहादुर', brave).feedback[0].key).toBe('english_letters');
    expect(evaluateSentenceRules('Call 9876543210 brave', brave).feedback[0].key).toBe('blocked');
  });
  it('gate order: devanagari beats blocked beats word_missing', () => {
    expect(evaluateSentenceRules('शब्द 9876543210', brave).gate).toBe('devanagari');
    expect(evaluateSentenceRules('fuck you 9876543210', brave).gate).toBe('blocked');
  });
  it('repeated token (>= 3 times) costs 2 grammar marks', () => {
    const a = evaluateSentenceRules('The brave boy ran to the park.', brave);
    const b = evaluateSentenceRules('The brave boy ran to the park and the zoo.', brave);
    expect(a.rubric.grammar).toBe(10);
    expect(b.rubric.grammar).toBe(8);
  });
  it('low confidence only on benefit-of-the-doubt relevance', () => {
    const sure = evaluateSentenceRules('The brave soldier saved the village.', brave);
    expect(sure.confidence).toBeGreaterThanOrEqual(0.6);
    const doubt = evaluateSentenceRules('Brave!', brave);
    expect(doubt.rubric.relevance).toBe(6);
    expect(doubt.confidence).toBeLessThan(0.6);
  });
  it('copy detection uses Jaccard >= 0.6', () => {
    const r = evaluateSentenceRules('The brave firefighter saved the little girl today.', brave);
    expect(r.errorCodes).toContain('SN_COPIED');
    expect(r.feedback.find((f) => f.key === 'copied')).toBeTruthy();
  });
  it('proper names are not counted as non-English', () => {
    const r = evaluateSentenceRules('Riya and Aarav are brave children.', brave);
    expect(r.errorCodes).not.toContain('SN_NON_ENGLISH');
  });
  it('each evaluation takes < 20 ms', () => {
    const t0 = performance.now();
    let worst = 0;
    for (let i = 0; i < 500; i++) {
      const c = cases[i % cases.length];
      const s = performance.now();
      evaluateSentenceRules(c.text, words[c.word]);
      worst = Math.max(worst, performance.now() - s);
    }
    expect((performance.now() - t0) / 500).toBeLessThan(20);
    expect(worst).toBeLessThan(20);
  });
});
