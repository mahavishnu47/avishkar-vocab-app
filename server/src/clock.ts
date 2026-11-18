/**
 * "Today" for the server. FAKE_TODAY (YYYY-MM-DD) overrides the real IST date for tests and demos.
 */
import { todayIST, type IsoDate } from '@shabd/core';

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: unknown): s is IsoDate {
  if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function today(): IsoDate {
  const fake = process.env.VERCEL_ENV === 'production' ? undefined : process.env.FAKE_TODAY;
  if (fake && isValidDate(fake)) return fake;
  return todayIST();
}
