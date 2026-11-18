import { describe, expect, it } from 'vitest';
import { computeXp, displayStreak, levelFor, updateStreak, EMPTY_STREAK, scoreWord } from '../src/index.ts';

const ws = (totals: number[]) => totals.map((t, i) => ({ wordId: `w${i}`, spelling: 0, meaning: 0, sentence: 0, total: t, stars: 0 as const }));

describe('computeXp', () => {
  it('Example D-like: 365 + 25 + 20 = 410', () => {
    const x = computeXp({ wordScores: ws([96, 60, 72, 85, 52]), completed: true, streakAfter: 4, isCatchUp: false });
    expect(x).toEqual({ wordMarks: 365, completionBonus: 25, streakBonus: 20, perfectBonus: 0, total: 410 });
  });
  it('streak bonus caps at 50', () => {
    const x = computeXp({ wordScores: ws([96, 60, 72, 85, 52]), completed: true, streakAfter: 12, isCatchUp: false });
    expect(x.streakBonus).toBe(50);
  });
  it('perfect bonus +5 per 100', () => {
    const x = computeXp({ wordScores: [scoreWord('a', 40, 20, 40), scoreWord('b', 40, 20, 40), scoreWord('c', 0, 0, 0)], completed: false, streakAfter: 3, isCatchUp: false });
    expect(x.perfectBonus).toBe(10);
    expect(x.completionBonus).toBe(0);
    expect(x.streakBonus).toBe(0);
    expect(x.total).toBe(210);
  });
  it('catch-up halves marks and gives no bonuses', () => {
    const x = computeXp({ wordScores: ws([100, 100, 100, 100, 99]), completed: true, streakAfter: 5, isCatchUp: true });
    expect(x).toEqual({ wordMarks: 250, completionBonus: 0, streakBonus: 0, perfectBonus: 0, total: 250 });
  });
});

describe('levelFor', () => {
  it('thresholds', () => {
    expect(levelFor(0).level).toBe(0);
    expect(levelFor(499)).toEqual({ level: 0, xpIntoLevel: 499, xpForNextLevel: 500 });
    expect(levelFor(500).level).toBe(1);
    expect(levelFor(1499).level).toBe(1);
    expect(levelFor(1500).level).toBe(2);
    expect(levelFor(2710)).toEqual({ level: 2, xpIntoLevel: 1210, xpForNextLevel: 1500 });
    expect(levelFor(3000).level).toBe(3);
    expect(levelFor(-5).level).toBe(0);
  });
});

describe('streak', () => {
  it('first completion, consecutive, gap, same day', () => {
    let s = updateStreak(EMPTY_STREAK, '2026-03-01');
    expect(s).toEqual({ current: 1, best: 1, lastCompletedDate: '2026-03-01' });
    s = updateStreak(s, '2026-03-01');
    expect(s.current).toBe(1);
    s = updateStreak(s, '2026-03-02');
    s = updateStreak(s, '2026-03-03');
    expect(s).toEqual({ current: 3, best: 3, lastCompletedDate: '2026-03-03' });
    s = updateStreak(s, '2026-03-06');
    expect(s).toEqual({ current: 1, best: 3, lastCompletedDate: '2026-03-06' });
  });
  it('month and year boundaries', () => {
    const s = updateStreak({ current: 4, best: 9, lastCompletedDate: '2025-12-31' }, '2026-01-01');
    expect(s).toEqual({ current: 5, best: 9, lastCompletedDate: '2026-01-01' });
  });
  it('displayStreak is 0 after a missed day', () => {
    const s = { current: 6, best: 6, lastCompletedDate: '2026-03-05' };
    expect(displayStreak(s, '2026-03-05')).toBe(6);
    expect(displayStreak(s, '2026-03-06')).toBe(6);
    expect(displayStreak(s, '2026-03-07')).toBe(0);
    expect(displayStreak(EMPTY_STREAK, '2026-03-07')).toBe(0);
  });
});
