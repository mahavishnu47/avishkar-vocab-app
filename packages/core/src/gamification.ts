/**
 * XP, streak and level helpers (PRD 7.5, simplified). OWNER: Lane B.
 * MVP simplifications: no shields, no review warm-up XP, no chest. Streak counts
 * consecutive CALENDAR days (home phones, content exists for every day incl. weekends).
 */
import { SCORING } from './scoring.config.ts';
import { addDays } from './dates.ts';
import type { IsoDate, StreakState, XpBreakdown, XpInput, LevelInfo } from './types.ts';

export const EMPTY_STREAK: StreakState = { current: 0, best: 0, lastCompletedDate: null };

/**
 * Apply a completed TODAY-mode set on `date`.
 * - same date as lastCompletedDate -> unchanged
 * - lastCompletedDate === date - 1 day -> current + 1
 * - otherwise -> current = 1
 * best = max(best, current).
 */
export function updateStreak(prev: StreakState, date: IsoDate): StreakState {
  if (prev.lastCompletedDate === date) return { ...prev };
  const current = prev.lastCompletedDate !== null && prev.lastCompletedDate === addDays(date, -1) ? prev.current + 1 : 1;
  return { current, best: Math.max(prev.best, current), lastCompletedDate: date };
}

/**
 * Streak as it should be DISPLAYED on `today` (no completion yet today):
 * if lastCompletedDate is today or yesterday -> current, else 0.
 */
export function displayStreak(state: StreakState, today: IsoDate): number {
  const last = state.lastCompletedDate;
  if (last === null) return 0;
  return last === today || last === addDays(today, -1) ? state.current : 0;
}

/**
 * Daily XP. Today mode: sum(word totals) + 25 if completed + min(5*streakAfter, 50) if completed
 * + 5 per 100/100 word. Catch-up: round(0.5 * sum(word totals)) only.
 * PRD 7.6 D-like: totals [96,60,72,85,52], completed, streakAfter 4 -> 365+25+20 = 410.
 */
export function computeXp(input: XpInput): XpBreakdown {
  const sum = input.wordScores.reduce((a, w) => a + w.total, 0);
  const xp = SCORING.xp;
  if (input.isCatchUp) {
    const wordMarks = Math.round(sum * xp.catchUpMultiplier);
    return { wordMarks, completionBonus: 0, streakBonus: 0, perfectBonus: 0, total: wordMarks };
  }
  const perfect = input.wordScores.filter((w) => w.total >= SCORING.wordMax).length;
  const completionBonus = input.completed ? xp.completionBonus : 0;
  const streakBonus = input.completed ? Math.min(xp.streakBonusPerDay * Math.max(0, input.streakAfter), xp.streakBonusCap) : 0;
  const perfectBonus = perfect * xp.perfectWordBonus;
  return { wordMarks: sum, completionBonus, streakBonus, perfectBonus, total: sum + completionBonus + streakBonus + perfectBonus };
}

/** Level from cumulative XP (L1 at 500, L2 at 1500, L3 at 3000 ... triangular, step 500). */
export function levelFor(totalXp: number): LevelInfo {
  const step = SCORING.xp.levelStep;
  const xp = Math.max(0, totalXp);
  let level = 0;
  while (step * ((level + 1) * (level + 2)) / 2 <= xp) level++;
  const start = (step * level * (level + 1)) / 2;
  return { level, xpIntoLevel: xp - start, xpForNextLevel: step * (level + 1) };
}
