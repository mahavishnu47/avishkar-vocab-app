import { describe, expect, it } from 'vitest';
import { SCORING, SPELLING_PRIMARY_PRIORITY, ERROR_LABELS } from '../src/index.ts';

// Scaffold sanity test. Lane B adds scoring.test.ts, spelling.test.ts, sentence.test.ts, gamification.test.ts, dates.test.ts.
describe('contract', () => {
  it('word max is 100 = 40 + 20 + 40', () => {
    expect(SCORING.spelling.max + SCORING.meaning.max + SCORING.sentence.max).toBe(SCORING.wordMax);
    const r = SCORING.sentence.rubricMax;
    expect(r.use + r.grammar + r.relevance + r.length).toBe(SCORING.sentence.max);
  });
  it('every priority code has a label', () => {
    for (const c of SPELLING_PRIMARY_PRIORITY) expect(ERROR_LABELS[c]).toBeTruthy();
  });
});
