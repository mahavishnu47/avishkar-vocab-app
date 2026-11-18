/**
 * XP, streak and level helpers (PRD 7.5, simplified). OWNER: Lane B.
 * MVP simplifications: no shields, no review warm-up XP, no chest. Streak counts
 * consecutive CALENDAR days (home phones, content exists for every day incl. weekends).
 */
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
  void prev; void date;
  throw new Error('not implemented');
}

/**
 * Streak as it should be DISPLAYED on `today` (no completion yet today):
 * if lastCompletedDate is today or yesterday -> current, else 0.
 */
export function displayStreak(state: StreakState, today: IsoDate): number {
  void state; void today;
  throw new Error('not implemented');
}

/**
 * Daily XP. Today mode: sum(word totals) + 25 if completed + min(5*streakAfter, 50) if completed
 * + 5 per 100/100 word. Catch-up: round(0.5 * sum(word totals)) only.
 * PRD 7.6 D-like: totals [96,60,72,85,52], completed, streakAfter 4 -> 365+25+20 = 410.
 */
export function computeXp(input: XpInput): XpBreakdown {
  void input;
  throw new Error('not implemented');
}

/** Level from cumulative XP (L1 at 500, L2 at 1500, L3 at 3000 ... triangular, step 500). */
export function levelFor(totalXp: number): LevelInfo {
  void totalXp;
  throw new Error('not implemented');
}
