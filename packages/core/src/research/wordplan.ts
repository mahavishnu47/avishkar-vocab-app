/** F2: school-day calendar and the 100-word study plan. Shared by server and web. */
import { addDays, daysBetween } from '../dates.ts';
import type { IsoDate } from '../types.ts';
import type { StudyGroup } from './study.ts';

export type StudyDayReason = 'study_day' | 'weekend' | 'holiday' | 'not_started' | 'finished' | 'comparison';

export interface StudyDayResult { dayNo: number | null; reason: Exclude<StudyDayReason, 'comparison'> }

/** Day of week, 0 = Sunday. */
function dow(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}
export const isWeekend = (date: IsoDate): boolean => { const w = dow(date); return w === 0 || w === 6; };

/**
 * Study day n = the nth Mon-Fri date on or after startDate that is not a holiday. Weekends and holidays have no
 * study day. Before the start: not_started. After the last (schoolDays-th) school day: finished.
 */
export function studyDayFor(startDate: IsoDate, date: IsoDate, holidays: readonly IsoDate[] | ReadonlySet<IsoDate>, schoolDays: number): StudyDayResult {
  const hol = holidays instanceof Set ? holidays : new Set(holidays);
  const span = daysBetween(startDate, date);
  if (span < 0) return { dayNo: null, reason: 'not_started' };
  if (span > 800) return { dayNo: null, reason: 'finished' };
  let count = 0;
  for (let i = 0; i <= span; i++) {
    const d = addDays(startDate, i);
    const weekend = isWeekend(d);
    const holiday = hol.has(d);
    if (!weekend && !holiday) count++;
    if (i === span) {
      if (!weekend && !holiday) return count > schoolDays ? { dayNo: null, reason: 'finished' } : { dayNo: count, reason: 'study_day' };
      if (count >= schoolDays) return { dayNo: null, reason: 'finished' };
      return { dayNo: null, reason: weekend ? 'weekend' : 'holiday' };
    }
  }
  return { dayNo: null, reason: 'not_started' };
}

/** The calendar date of every study day 1..schoolDays (holidays and weekends skipped). */
export function studyDates(startDate: IsoDate, holidays: readonly IsoDate[], schoolDays: number): IsoDate[] {
  const hol = new Set(holidays);
  const out: IsoDate[] = [];
  for (let i = 0; out.length < schoolDays && i < 800; i++) {
    const d = addDays(startDate, i);
    if (!isWeekend(d) && !hol.has(d)) out.push(d);
  }
  return out;
}

/** Calendar date of study day n (n >= 1). */
export function studyDateFor(startDate: IsoDate, holidays: readonly IsoDate[], n: number): IsoDate {
  return studyDates(startDate, holidays, n)[n - 1] ?? startDate;
}

export const STUDY_PLAN_WORDS_PER_DAY = 5;
/** Target parts of speech for the 100-word list (used for the balance warning). */
export const PLAN_POS_TARGET = { noun: 35, verb: 25, adjective: 25, adverb: 15 } as const;
export const MIN_PLAN_ADVERBS = 10;

export interface PlanWord { position: number; wordId: string; word: string; partOfSpeech: string; difficulty: number }
export interface PlanDay { dayNo: number; date: IsoDate; words: PlanWord[] }
export interface StudyPlanRes {
  studyId: number;
  startDate: IsoDate;
  schoolDays: number;
  holidays: IsoDate[];
  days: PlanDay[];
  posCounts: Record<string, number>;
  warnings: string[];
}
export interface PutPlanDayReq { wordIds: string[] }
export interface PutHolidaysReq { dates: IsoDate[] }
export interface StudyDayRes {
  inStudy: boolean;
  group: StudyGroup | null;
  dayNo: number | null;
  totalDays: number;
  reason: StudyDayReason | 'no_study';
}

export function planWarnings(counts: Record<string, number>): string[] {
  const w: string[] = [];
  const adv = counts.adverb ?? 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // A full 100-word plan needs MIN_PLAN_ADVERBS; a shorter plan (e.g. 10 school days = 50 words) needs proportionally fewer.
  const min = total >= 100 ? MIN_PLAN_ADVERBS : Math.floor(total / 12);
  const target = total >= 100 ? PLAN_POS_TARGET.adverb : Math.round((PLAN_POS_TARGET.adverb * total) / 100);
  if (adv < min) w.push(`Only ${adv} adverb${adv === 1 ? '' : 's'} in this plan. Part-of-speech tests need about ${target}.`);
  return w;
}
