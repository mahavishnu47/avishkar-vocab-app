/**
 * Join/invite codes, URL paths and WhatsApp text builders shared by server and UI
 * (so the texts never drift). FROZEN by O1 (onboarding v2). Contract file: see docs/ONBOARDING_SPEC.md 3.3 and 4.1.
 */
import type { InviteKind } from './api.ts';
import type { IsoDate } from './types.ts';

/** Unambiguous alphabet (no 0, O, 1, I). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Uppercase and strip everything except A-Z and 0-9. */
export function normalizeCode(s: string): string {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** 'ABCDEFGH' -> 'ABCD-EFGH'. Input is normalised first. */
export function formatInviteCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** True when the normalised input is 8 characters, all from CODE_ALPHABET. */
export function isValidInviteCode(s: string): boolean {
  const c = normalizeCode(s);
  return c.length === 8 && [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

/** Academic year (June-May) of a 'YYYY-MM-DD' date: '2026-05-31' -> '2025-26', '2026-06-01' -> '2026-27'. */
export function academicYearFor(date: IsoDate): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** className(5, 'a') -> '5A'; className(5, '') -> '5'. */
export function className(standard: number, division = ''): string {
  return `${standard}${division.trim().toUpperCase()}`;
}

export const joinPath = (classCode: string): string => `/j/${classCode}`;
export const schoolJoinPath = (studentCode: string): string => `/s/${studentCode}`;
export function invitePath(kind: InviteKind, code: string): string {
  const prefix = kind === 'school_admin' ? '/a/' : kind === 'teacher' ? '/t/' : '/r/';
  return `${prefix}${normalizeCode(code)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '4 Dec' for an ISO timestamp, in India time (UTC+5:30). */
function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t + 5.5 * 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function classJoinText(a: { schoolName: string; className: string; url: string }): string {
  return `WordWise 🦜: 5 new English words every day, for Class ${a.className}, ${a.schoolName}. On your child's phone: 1) Open ${a.url} 2) Tap your child's name 3) Type the 4-digit PIN from the card the teacher gave. Free. No ads. About 15 minutes a day.`;
}

export function teacherInviteText(a: { schoolName: string; url: string; code: string; expiresAt: string }): string {
  return `Join our school on WordWise 🦜 (daily English words for Std 5). 1) Open ${a.url} 2) Enter your name, email and a password. School code: ${formatInviteCode(a.code)}. Works until ${shortDate(a.expiresAt)}.`;
}

export function schoolSetupText(a: { schoolName: string; url: string; expiresAt: string }): string {
  return `Namaste! Your school is ready on WordWise 🦜. Open this link to set up your school (takes 1 minute): ${a.url}. This link works once and ends on ${shortDate(a.expiresAt)}.`;
}

export function resetText(a: { teacherName: string; url: string }): string {
  return `Namaste ${a.teacherName}! Open this link to choose a new WordWise password: ${a.url}. It works once and ends in 24 hours.`;
}
