import { describe, expect, it } from 'vitest';
import { studyDateFor, studyDates, studyDayFor } from '../src/research/wordplan.ts';

// 2026-11-16 is a Monday.
describe('studyDayFor', () => {
  it('counts Mon-Fri as days 1-5 and the next Monday as day 6', () => {
    expect(studyDayFor('2026-11-16', '2026-11-16', [], 20)).toEqual({ dayNo: 1, reason: 'study_day' });
    expect(studyDayFor('2026-11-16', '2026-11-20', [], 20)).toEqual({ dayNo: 5, reason: 'study_day' });
    expect(studyDayFor('2026-11-16', '2026-11-23', [], 20)).toEqual({ dayNo: 6, reason: 'study_day' });
  });
  it('has no study day on weekends', () => {
    expect(studyDayFor('2026-11-16', '2026-11-21', [], 20)).toEqual({ dayNo: null, reason: 'weekend' });
    expect(studyDayFor('2026-11-16', '2026-11-22', [], 20)).toEqual({ dayNo: null, reason: 'weekend' });
  });
  it('a holiday shifts later days by one', () => {
    expect(studyDayFor('2026-11-16', '2026-11-18', ['2026-11-18'], 20)).toEqual({ dayNo: null, reason: 'holiday' });
    expect(studyDayFor('2026-11-16', '2026-11-19', ['2026-11-18'], 20).dayNo).toBe(3);
    expect(studyDayFor('2026-11-16', '2026-11-23', new Set(['2026-11-18']), 20).dayNo).toBe(5);
  });
  it('a start date on a Saturday starts the next Monday', () => {
    expect(studyDayFor('2026-11-21', '2026-11-21', [], 20).reason).toBe('weekend');
    expect(studyDayFor('2026-11-21', '2026-11-23', [], 20).dayNo).toBe(1);
  });
  it('is not_started before the start date', () => {
    expect(studyDayFor('2026-11-16', '2026-11-13', [], 20)).toEqual({ dayNo: null, reason: 'not_started' });
  });
  it('is finished after the last school day, including the weekend after it', () => {
    // 20 school days from Mon 2026-11-16 end on Fri 2026-12-11
    expect(studyDayFor('2026-11-16', '2026-12-11', [], 20).dayNo).toBe(20);
    expect(studyDayFor('2026-11-16', '2026-12-12', [], 20)).toEqual({ dayNo: null, reason: 'finished' });
    expect(studyDayFor('2026-11-16', '2026-12-14', [], 20)).toEqual({ dayNo: null, reason: 'finished' });
    expect(studyDayFor('2026-11-16', '2028-01-01', [], 20).reason).toBe('finished');
  });
});

describe('studyDates', () => {
  it('lists the nth school dates, skipping weekends and holidays', () => {
    const d = studyDates('2026-11-16', ['2026-11-17'], 5);
    expect(d).toEqual(['2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23']);
    expect(studyDateFor('2026-11-16', ['2026-11-17'], 5)).toBe('2026-11-23');
  });
});
