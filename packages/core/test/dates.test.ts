import { describe, expect, it } from 'vitest';
import { addDays, dayIndexFor, daysBetween, todayIST, weekStart } from '../src/index.ts';

describe('dates', () => {
  it('todayIST handles the IST midnight edge', () => {
    expect(todayIST(new Date('2026-11-19T18:29:59Z'))).toBe('2026-11-19');
    expect(todayIST(new Date('2026-11-19T18:31:00Z'))).toBe('2026-11-20');
    expect(todayIST(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
  it('todayIST defaults to now', () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('daysBetween / addDays', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(daysBetween('2026-03-01', '2026-01-01')).toBe(-59);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('dayIndexFor boundaries and wrap', () => {
    const s = '2026-01-01';
    expect(dayIndexFor(s, s)).toBe(1);
    expect(dayIndexFor(s, addDays(s, 365))).toBe(366);
    expect(dayIndexFor(s, addDays(s, 366))).toBe(1);
    expect(dayIndexFor(s, addDays(s, -1))).toBe(366);
    expect(dayIndexFor(s, addDays(s, 732))).toBe(1);
  });
  it('weekStart returns Monday', () => {
    expect(weekStart('2026-11-18')).toBe('2026-11-16'); // Wednesday
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
  });
});
