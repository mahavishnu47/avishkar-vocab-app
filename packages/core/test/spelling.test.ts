import { describe, expect, it } from 'vitest';
import { classifySpellingError, correctPositions, damerauLevenshtein, normalizeSpelling } from '../src/index.ts';
import { phoneticKey } from '../src/spelling.ts';
import fixture from './fixtures/spelling.json';

interface Case { target: string; attempt: string; primary: string; has?: string[]; prd?: boolean }
const cases = fixture as Case[];

describe('helpers', () => {
  it('normalizeSpelling', () => {
    expect(normalizeSpelling('  Brave ')).toBe('brave');
    expect(normalizeSpelling('a   B')).toBe('a b');
  });
  it('damerauLevenshtein (OSA)', () => {
    expect(damerauLevenshtein('', '')).toBe(0);
    expect(damerauLevenshtein('abc', '')).toBe(3);
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3);
    expect(damerauLevenshtein('ab', 'ba')).toBe(1);
    expect(damerauLevenshtein('ancient', 'anceint')).toBe(1);
    expect(damerauLevenshtein('ca', 'abc')).toBe(3);
  });
  it('correctPositions', () => {
    expect(correctPositions('whisper', 'wispar')).toEqual([true, false, false, false, false, false, false].map((_, i) => 'whisper'[i] === 'wispar'[i]));
    expect(correctPositions('cat', 'cut')).toEqual([true, false, true]);
    expect(correctPositions('cat', 'Ca')).toEqual([true, true, false]);
  });
  it('phoneticKey', () => {
    expect(phoneticKey('whisper')).toBe(phoneticKey('wisper'));
    expect(phoneticKey('knife')).toBe(phoneticKey('nife'));
    expect(phoneticKey('phone')).toBe(phoneticKey('fone'));
    expect(phoneticKey('')).toBe('');
    expect(phoneticKey('science')).toBe(phoneticKey('sience'));
    expect(phoneticKey('night')).toBe(phoneticKey('nite'));
    expect(phoneticKey('judge')).toBe(phoneticKey('juj'));
  });
});

describe('classifySpellingError: spec examples', () => {
  it('whisper / wisper', () => {
    const r = classifySpellingError('whisper', 'wisper');
    expect(r).toMatchObject({ isCorrect: false, primary: 'SP_SILENT', editDistance: 1 });
    expect(r.tags[0]).toBe('SP_SILENT');
  });
  it('correct ignoring case and spaces', () => {
    expect(classifySpellingError('brave', 'Brave ')).toEqual({ isCorrect: true, tags: ['SP_CORRECT'], primary: 'SP_CORRECT', editDistance: 0 });
  });
  it('blank', () => {
    expect(classifySpellingError('brave', '')).toEqual({ isCorrect: false, tags: ['SP_BLANK'], primary: 'SP_BLANK', editDistance: 5 });
  });
});

describe('classifySpellingError: labelled fixture', () => {
  it('has at least 80 pairs covering every code', () => {
    expect(cases.length).toBeGreaterThanOrEqual(80);
    const seen = new Set(cases.map((c) => c.primary));
    for (const code of ['SP_CORRECT', 'SP_PHONETIC', 'SP_SILENT', 'SP_DOUBLE', 'SP_VOWEL', 'SP_OMISSION', 'SP_INSERTION', 'SP_TRANSPOSE', 'SP_SUBST', 'SP_HOMOPHONE', 'SP_REALWORD', 'SP_L1', 'SP_FARMISS', 'SP_BLANK']) {
      expect(seen.has(code), code).toBe(true);
    }
  });
  it('every PRD 9.1 example is exact (primary, plus the listed tags)', () => {
    for (const c of cases.filter((x) => x.prd)) {
      const r = classifySpellingError(c.target, c.attempt);
      expect(r.primary, `${c.target}->${c.attempt}`).toBe(c.primary);
      for (const h of c.has ?? []) expect(r.tags, `${c.target}->${c.attempt}`).toContain(h);
    }
  });
  it('>= 85% primary-tag agreement', () => {
    const misses: string[] = [];
    for (const c of cases) {
      const r = classifySpellingError(c.target, c.attempt);
      if (r.primary !== c.primary) misses.push(`${c.target}->${c.attempt}: want ${c.primary} got ${r.primary}`);
    }
    const agreement = 1 - misses.length / cases.length;
    if (misses.length) console.log('spelling misses:', misses);
    expect(agreement).toBeGreaterThanOrEqual(0.85);
  });
  it('extra tags listed in "has" are present', () => {
    for (const c of cases) {
      const r = classifySpellingError(c.target, c.attempt);
      for (const h of c.has ?? []) expect(r.tags, `${c.target}->${c.attempt}`).toContain(h);
    }
  });
  it('tags are ordered by priority, primary is first, correct/blank are exclusive', () => {
    for (const c of cases) {
      const r = classifySpellingError(c.target, c.attempt);
      expect(r.tags[0]).toBe(r.primary);
      if (r.isCorrect || r.primary === 'SP_BLANK') expect(r.tags).toHaveLength(1);
      expect(r.editDistance).toBe(damerauLevenshtein(c.target, c.attempt.trim().toLowerCase()));
    }
  });
  it('is fast: < 2 ms per call on average (1000 calls)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const c = cases[i % cases.length];
      classifySpellingError(c.target, c.attempt);
    }
    expect((performance.now() - t0) / 1000).toBeLessThan(2);
  });
});
