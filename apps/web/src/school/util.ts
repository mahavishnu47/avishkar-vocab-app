/** Small pure helpers for the school and admin screens. */
import type { AuditEntry } from '@shabd/core';
import { ApiRequestError } from '../shared/api.ts';

export function errMsg(e: unknown): string {
  if (e instanceof ApiRequestError) {
    return e.isNetwork ? 'No internet. Your changes were not saved. Try again.' : e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

export const whatsappUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Copy with the clipboard API, falling back to select-and-copy. Returns true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function joinedPct(joined: number, total: number): number {
  return total > 0 ? Math.round((joined / total) * 100) : 0;
}

export interface RankedClass { name: string; teacherName: string; pct: number }
/** Top classes by this-week completion; classes without students are skipped. */
export function topClasses<T extends { name: string; teacherName: string; studentCount: number; weekCompletionPct: number; archived?: boolean }>(
  rows: readonly T[], n = 3,
): RankedClass[] {
  return rows
    .filter((r) => r.studentCount > 0 && !r.archived)
    .map((r) => ({ name: r.name, teacherName: r.teacherName, pct: r.weekCompletionPct }))
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
    .slice(0, n);
}

const VERBS: Record<string, string> = {
  'teacher.deactivate': 'turned off',
  'teacher.activate': 'turned on',
  'teacher.role_change': 'changed the role of',
  'teacher.join': 'joined the school',
  'teacher.reset_link': 'made a password link for',
  'class.reassign': 'changed the teacher of',
  'class.archive': 'archived',
  'class.create': 'created',
  'student.reset_pin': 'reset the PIN of',
  'student.add': 'added',
  'school.rotate_student_code': 'made a new student link',
  'school.update': 'updated school details',
  'invite.create': 'made a new teacher code',
  'invite.revoke': 'turned off a teacher code',
};

/** One plain-words line for the activity list, e.g. "Mrs. Patil reset the PIN of Riya". */
export function describeAudit(e: AuditEntry): string {
  const who = e.actorName ?? (e.actorType === 'super' ? 'Shabd Mitra' : e.actorType === 'student' ? 'A student' : 'The system');
  const verb = VERBS[e.action] ?? e.action.replace(/[._]/g, ' ');
  return [who, verb, e.targetLabel].filter(Boolean).join(' ');
}

export function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t + 5.5 * 3_600_000);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${d.getUTCDate()} ${m}`;
}

export const todayIst = (now: Date = new Date()): string => new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** Only /school... and /teacher... are allowed as a post-login target. */
export function safeNext(next: string | null): string {
  return next && /^\/(school|teacher)(\/|$|\?)/.test(next) ? next : '/school';
}

export function mockRequested(key: string): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('mock');
    if (q === '1') sessionStorage.setItem(key, '1');
    if (q === '0') sessionStorage.removeItem(key);
    return sessionStorage.getItem(key) === '1';
  } catch { return false; }
}
