import { describe, expect, it } from 'vitest';
import { scoreSpelling, scoreMeaning, scoreSentence, scoreSentenceSubmission, scoreWord, starsFor } from '../src/index.ts';

const rub = (use: number, grammar: number, relevance: number, length: number) => ({ use, grammar, relevance, length });

describe('scoring (PRD 7.6)', () => {
  it('Example A -> 96, 3 stars', () => {
    const sp = scoreSpelling({ correctOnAttempt: 1, hints: [] });
    const mn = scoreMeaning(1);
    const sn = scoreSentence([{ submissionNo: 1, rubric: rub(10, 10, 12, 4), starterHintUsed: false }]);
    expect([sp, mn, sn]).toEqual([40, 20, 36]);
    const w = scoreWord('d001-1', sp, mn, sn);
    expect(w.total).toBe(96);
    expect(w.stars).toBe(3);
  });
  it('Example B -> 60, 2 stars', () => {
    const sp = scoreSpelling({ correctOnAttempt: 2, hints: [] });
    const mn = scoreMeaning(2);
    const sn = scoreSentence([{ submissionNo: 1, rubric: rub(10, 6, 12, 0), starterHintUsed: false }]);
    expect([sp, mn, sn]).toEqual([24, 8, 28]);
    const w = scoreWord('x', sp, mn, sn);
    expect(w.total).toBe(60);
    expect(w.stars).toBe(2);
  });
  it('Example C -> best submission 32, total 52, 1 star', () => {
    const sp = scoreSpelling({ correctOnAttempt: null, hints: [] });
    const mn = scoreMeaning(1);
    const sn = scoreSentence([
      { submissionNo: 1, rubric: rub(10, 10, 0, 0), starterHintUsed: false },
      { submissionNo: 2, rubric: rub(10, 10, 12, 8), starterHintUsed: false },
    ]);
    expect(sn).toBe(32);
    const w = scoreWord('x', sp, mn, sn);
    expect(w.total).toBe(52);
    expect(w.stars).toBe(1);
  });
  it('Example E -> 18 with first-letter hint on attempt 2', () => {
    expect(scoreSpelling({ correctOnAttempt: 2, hints: ['first_letter'] })).toBe(18);
  });
  it('attempt multipliers', () => {
    expect(scoreSpelling({ correctOnAttempt: 3, hints: [] })).toBe(12);
    expect(scoreMeaning(null)).toBe(0);
  });
  it('hints never go below 0, duplicates count once', () => {
    expect(scoreSpelling({ correctOnAttempt: 3, hints: ['first_letter', 'letter_tiles'] })).toBe(0);
    expect(scoreSpelling({ correctOnAttempt: 1, hints: ['first_letter', 'first_letter'] })).toBe(34);
    expect(scoreSpelling({ correctOnAttempt: 1, hints: ['first_letter', 'letter_tiles', 'letter_tiles'] })).toBe(20);
  });
  it('sentence submission math, starter hint, retry never lowers', () => {
    expect(scoreSentenceSubmission({ submissionNo: 2, rubric: rub(10, 10, 12, 8), starterHintUsed: false })).toBe(32);
    expect(scoreSentenceSubmission({ submissionNo: 1, rubric: rub(10, 10, 12, 8), starterHintUsed: true })).toBe(35);
    expect(scoreSentenceSubmission({ submissionNo: 1, rubric: rub(0, 0, 0, 2), starterHintUsed: true })).toBe(0);
    expect(scoreSentence([])).toBe(0);
    const best = scoreSentence([
      { submissionNo: 1, rubric: rub(10, 10, 12, 8), starterHintUsed: false },
      { submissionNo: 2, rubric: rub(10, 2, 6, 0), starterHintUsed: false },
    ]);
    expect(best).toBe(40);
  });
  it('stars thresholds and clamping', () => {
    expect([100, 90, 89, 60, 59, 30, 29, 0].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
    const w = scoreWord('x', 99, 99, 99);
    expect(w).toMatchObject({ spelling: 40, meaning: 20, sentence: 40, total: 100, stars: 3 });
  });
});
