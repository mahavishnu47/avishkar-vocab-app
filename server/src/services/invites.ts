/**
 * Invites: school setup links, teacher invites, password resets. Codes are 8 characters from the unambiguous
 * alphabet (40 bits), generated with node:crypto. Contract: docs/ONBOARDING_SPEC.md 3.3 and 4.
 */
import { randomInt } from 'node:crypto';
import type { Request } from 'express';
import { CODE_ALPHABET, formatInviteCode, invitePath, isValidInviteCode, normalizeCode, resetText, schoolSetupText, teacherInviteText } from '@shabd/core';
import type { Invite, InviteKind, InviteWithText } from '@shabd/core';
import { getDb, isUniqueViolation, type Queryable, type Row } from '../db/db.ts';
import { HttpError } from '../http.ts';

export const INVALID_CODE_MSG = 'This code is not valid. Ask for a new one.';
export const DAY_MS = 86_400_000;

export function generateInviteCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Public base URL: PUBLIC_APP_URL, else x-forwarded-proto + x-forwarded-host/host. */
export function baseUrl(req?: Request): string {
  const env = process.env.PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, '');
  if (req) {
    const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'http').split(',')[0]!.trim();
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0]!.trim();
    return `${proto}://${host}`;
  }
  return 'http://localhost:5173';
}

export function inviteOf(r: Row, base: string): Invite {
  return {
    id: r.id as number,
    kind: r.kind as InviteKind,
    code: formatInviteCode(r.code as string),
    url: `${base}${invitePath(r.kind as InviteKind, r.code as string)}`,
    expiresAt: r.expires_at as string,
    maxUses: (r.max_uses as number | null) ?? null,
    useCount: r.use_count as number,
    revokedAt: (r.revoked_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export interface NewInvite {
  kind: InviteKind;
  schoolId: number;
  teacherId?: number | null;
  createdByTeacherId?: number | null;
  maxUses: number | null;
  ttlMs: number;
}

/** Insert an invite. A code clash (1 in 10^12) retries outside a transaction; inside one it surfaces as an error. */
export async function createInvite(q: Queryable, n: NewInvite): Promise<Row> {
  const expires = new Date(Date.now() + n.ttlMs).toISOString();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const r = await q.run(
        `INSERT INTO invites (code, kind, school_id, teacher_id, created_by_teacher_id, max_uses, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        [generateInviteCode(), n.kind, n.schoolId, n.teacherId ?? null, n.createdByTeacherId ?? null, n.maxUses, expires],
      );
      return r.rows[0]!;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new HttpError(500, 'internal', 'Could not generate a code');
}

/** How many teachers one invite link can add before the principal has to make a new one. */
export const DEFAULT_TEACHER_INVITE_USES = 30;

export const notValid =(msg = INVALID_CODE_MSG) => new HttpError(404, 'not_found', msg);

/**
 * Look up a usable invite by typed code: right alphabet, not revoked, not expired, not used up, school active.
 * Pass `lock` inside a transaction to SELECT ... FOR UPDATE the invite row. Returns undefined when unusable.
 */
export async function findUsableInvite(q: Queryable, raw: unknown, kinds: InviteKind[], lock = false): Promise<(Row & { school_name: string }) | undefined> {
  if (typeof raw !== 'string' || !isValidInviteCode(raw)) return undefined;
  return q.get<Row & { school_name: string }>(
    `SELECT i.*, s.name AS school_name
       FROM invites i JOIN schools s ON s.id = i.school_id
      WHERE i.code = ? AND i.kind = ANY(?) AND i.revoked_at IS NULL AND i.expires_at > ?
        AND (i.max_uses IS NULL OR i.use_count < i.max_uses) AND s.status = 'active'
      ${lock ? 'FOR UPDATE OF i' : ''}`,
    [normalizeCode(raw), kinds, new Date().toISOString()],
  );
}

/** Count a use of the (locked) invite. */
export async function consumeInvite(q: Queryable, inviteId: number): Promise<void> {
  await q.run('UPDATE invites SET use_count = use_count + 1 WHERE id = ?', [inviteId]);
}

/** The school's newest live teacher invite (not revoked, not expired), or null. */
export async function liveTeacherInvite(q: Queryable, schoolId: number): Promise<Row | null> {
  return (await q.get(
    `SELECT * FROM invites WHERE school_id = ? AND kind = 'teacher' AND revoked_at IS NULL AND expires_at > ?
      ORDER BY id DESC LIMIT 1`,
    [schoolId, new Date().toISOString()],
  )) ?? null;
}

export function withText(inv: Invite, schoolName: string, extra?: { teacherName?: string }): InviteWithText {
  const whatsappText =
    inv.kind === 'school_admin' ? schoolSetupText({ schoolName, url: inv.url, expiresAt: inv.expiresAt })
    : inv.kind === 'teacher' ? teacherInviteText({ schoolName, url: inv.url, code: inv.code, expiresAt: inv.expiresAt })
    : resetText({ teacherName: extra?.teacherName ?? '', url: inv.url });
  return { ...inv, whatsappText };
}

export const schoolNameOf = async (schoolId: number, q: Queryable = getDb()): Promise<string> =>
  (await q.get<{ name: string }>('SELECT name FROM schools WHERE id = ?', [schoolId]))?.name ?? '';
