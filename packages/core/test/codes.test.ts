import { describe, expect, it } from 'vitest';
import {
  academicYearFor, className, classJoinText, CODE_ALPHABET, formatInviteCode, invitePath, isValidInviteCode, joinPath,
  normalizeCode, resetText, schoolJoinPath, schoolSetupText, teacherInviteText,
} from '../src/index.ts';

describe('codes', () => {
  it('normalises', () => {
    expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeCode('k7q 2mx!')).toBe('K7Q2MX');
  });
  it('formats and validates invite codes', () => {
    expect(formatInviteCode('abcdefgh')).toBe('ABCD-EFGH');
    expect(formatInviteCode('ABCD-EFGH')).toBe('ABCD-EFGH');
    expect(isValidInviteCode('abcd-efgh')).toBe(true);
    expect(isValidInviteCode('ABCD-EFG')).toBe(false);
    expect(isValidInviteCode('ABCD-EFG0')).toBe(false);
    expect(isValidInviteCode('ABCD-EFGI')).toBe(false);
    expect(CODE_ALPHABET).toHaveLength(32);
  });
  it('academic year boundaries', () => {
    expect(academicYearFor('2026-05-31')).toBe('2025-26');
    expect(academicYearFor('2026-06-01')).toBe('2026-27');
    expect(academicYearFor('2026-11-20')).toBe('2026-27');
    expect(academicYearFor('2027-01-15')).toBe('2026-27');
    expect(academicYearFor('2099-06-01')).toBe('2099-00');
  });
  it('class names and paths', () => {
    expect(className(5, 'a')).toBe('5A');
    expect(className(5, '')).toBe('5');
    expect(className(10)).toBe('10');
    expect(joinPath('K7Q2MX')).toBe('/j/K7Q2MX');
    expect(schoolJoinPath('DEMSCH')).toBe('/s/DEMSCH');
    expect(invitePath('school_admin', 'abcd-efgh')).toBe('/a/ABCDEFGH');
    expect(invitePath('teacher', 'ABCDEFGH')).toBe('/t/ABCDEFGH');
    expect(invitePath('password_reset', 'ABCDEFGH')).toBe('/r/ABCDEFGH');
  });
  it('text builders contain the URL and never a PIN', () => {
    const c = classJoinText({ schoolName: 'ZP School Kalwa', className: '5A', url: 'https://x.app/j/K7Q2MX' });
    expect(c).toContain('https://x.app/j/K7Q2MX');
    expect(c).toContain('Class 5A, ZP School Kalwa');
    const t = teacherInviteText({ schoolName: 'S', url: 'https://x.app/t/ABCDEFGH', code: 'ABCDEFGH', expiresAt: '2026-12-20T10:00:00.000Z' });
    expect(t).toContain('https://x.app/t/ABCDEFGH');
    expect(t).toContain('ABCD-EFGH');
    expect(t).toContain('20 Dec');
    const s = schoolSetupText({ schoolName: 'S', url: 'https://x.app/a/ABCDEFGH', expiresAt: '2026-12-04T00:00:00.000Z' });
    expect(s).toContain('https://x.app/a/ABCDEFGH');
    expect(s).toContain('4 Dec');
    expect(resetText({ teacherName: 'Mrs. Patil', url: 'https://x.app/r/ABCDEFGH' })).toContain('https://x.app/r/ABCDEFGH');
    for (const x of [c, t, s]) expect(x).not.toMatch(/\bPIN: ?\d{4}/);
  });
});
