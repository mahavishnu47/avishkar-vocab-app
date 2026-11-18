/**
 * Date helpers (Asia/Kolkata). OWNER: Lane B.
 */
import type { IsoDate } from './types.ts';

const IST_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_MS = 86_400_000;

function toUtcMs(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in Asia/Kolkata as 'YYYY-MM-DD'. `now` defaults to new Date(). */
export function todayIST(now: Date = new Date()): IsoDate {
  return IST_FMT.format(now);
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + n * DAY_MS);
}

/**
 * Content day for a class on `date`: ((daysBetween(startDate, date) mod 366) + 366) mod 366 + 1.
 * startDate itself -> 1; startDate + 365 -> 366; startDate + 366 -> 1; startDate - 1 -> 366.
 */
export function dayIndexFor(startDate: IsoDate, date: IsoDate): number {
  return ((daysBetween(startDate, date) % 366) + 366) % 366 + 1;
}

/** Monday (IST) of the week containing `date` - leaderboard week key. */
export function weekStart(date: IsoDate): IsoDate {
  const dow = new Date(toUtcMs(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}
