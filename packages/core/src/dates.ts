/**
 * Date helpers (Asia/Kolkata). OWNER: Lane B.
 */
import type { IsoDate } from './types.ts';

/** Today's date in Asia/Kolkata as 'YYYY-MM-DD'. `now` defaults to new Date(). */
export function todayIST(now?: Date): IsoDate {
  void now;
  throw new Error('not implemented');
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  void a; void b;
  throw new Error('not implemented');
}

export function addDays(date: IsoDate, n: number): IsoDate {
  void date; void n;
  throw new Error('not implemented');
}

/**
 * Content day for a class on `date`: ((daysBetween(startDate, date) mod 366) + 366) mod 366 + 1.
 * startDate itself -> 1; startDate + 365 -> 366; startDate + 366 -> 1; startDate - 1 -> 366.
 */
export function dayIndexFor(startDate: IsoDate, date: IsoDate): number {
  void startDate; void date;
  throw new Error('not implemented');
}

/** Monday (IST) of the week containing `date` - leaderboard week key. */
export function weekStart(date: IsoDate): IsoDate {
  void date;
  throw new Error('not implemented');
}
