/**
 * Auth primitives + middleware. OWNER: Lane A (server).
 * Bearer tokens stored in auth_tokens (opaque random hex). No JWT, no cookies.
 */
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { StaffRole } from '@shabd/core';
import { getDb, type Queryable } from './db/db.ts';
import { unauthorized } from './http.ts';

export interface TeacherAuth { role: 'teacher'; teacherId: number; schoolId: number; staffRole: StaffRole; token: string }
export interface StudentAuth { role: 'student'; studentId: number; classId: number; schoolId: number; token: string }
export type AuthContext = TeacherAuth | StudentAuth;

declare module 'express-serve-static-core' {
  interface Request { auth?: AuthContext }
}

export const TEACHER_TOKEN_DAYS = 7;
export const STUDENT_TOKEN_DAYS = 60;

/** 'scrypt$<saltHex>$<hashHex>' using node:crypto scryptSync (N=16384, 64-byte key). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const expected = Buffer.from(parts[2]!, 'hex');
    const actual = scryptSync(password, Buffer.from(parts[1]!, 'hex'), expected.length, { N: 16384 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 32 random bytes as hex */
export function newToken(): string {
  return randomBytes(32).toString('hex');
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 6 chars from 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' (no 0/O/1/I); caller retries on UNIQUE clash */
export function generateClassCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

/** 4 random digits, '0000'-'9999', avoiding trivially guessable 0000/1111/1234 */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(10000)).padStart(4, '0');
    if (pin !== '0000' && pin !== '1111' && pin !== '1234') return pin;
  }
}

/**
 * A PIN no other child in the class already has. Two children sharing a PIN could open each other's profile,
 * so retry until it is free (a class has far fewer than 10,000 children, so this ends fast).
 */
export async function generateClassPin(q: Queryable, classId: number, exceptStudentId?: number): Promise<string> {
  const rows = await q.all<{ pin: string }>('SELECT pin FROM students WHERE class_id = ? AND id <> ?', [classId, exceptStudentId ?? 0]);
  const taken = new Set(rows.map((r) => r.pin));
  for (let i = 0; i < 200; i++) {
    const pin = generatePin();
    if (!taken.has(pin)) return pin;
  }
  throw new Error('No free PIN left in this class');
}

/** Avatar emoji pool; pick deterministically by roll number so cards are stable. */
export const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🐘', '🦒', '🐢', '🐬', '🦉', '🐝', '🦋', '🐞', '🐧', '🐨', '🦓', '🐰', '🐻', '🦚'] as const;

export function avatarFor(rollNo: number): string {
  return AVATARS[(((rollNo - 1) % AVATARS.length) + AVATARS.length) % AVATARS.length]!;
}

/** Create and store a token; returns it. Pass a transaction handle to issue it inside that transaction. */
export async function issueToken(role: 'teacher' | 'student', id: number, q: Queryable = getDb()): Promise<string> {
  const token = newToken();
  const days = role === 'teacher' ? TEACHER_TOKEN_DAYS : STUDENT_TOKEN_DAYS;
  const now = Date.now();
  await q.run('INSERT INTO auth_tokens (token, role, teacher_id, student_id, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)', [
    token, role, role === 'teacher' ? id : null, role === 'student' ? id : null,
    new Date(now + days * 86_400_000).toISOString(), new Date(now).toISOString(),
  ]);
  return token;
}

interface TokenRow {
  role: 'teacher' | 'student'; last_used_at: string | null; teacher_id: number | null; student_id: number | null;
  t_school: number | null; t_role: StaffRole | null; t_active: number | null; t_status: string | null;
  class_id: number | null; s_active: number | null; c_archived: number | null; s_school: number | null; s_status: string | null;
}

const RENEW_AFTER_MS = 86_400_000;

/** Fire-and-forget housekeeping, about 1 request in 100. */
function maybeCleanup(): void {
  if (Math.random() >= 0.01) return;
  const db = getDb();
  const now = Date.now();
  db.run('DELETE FROM auth_tokens WHERE expires_at < ?', [new Date(now).toISOString()])
    .then(() => db.run('DELETE FROM rate_limits WHERE window_start < ?', [new Date(now - 86_400_000).toISOString()]))
    .catch((e) => console.error('[auth] cleanup failed', e));
}

/**
 * Resolves Authorization: Bearer <token> into req.auth. Never rejects. Leaves req.auth unset when the token is
 * unknown/expired, the teacher or student is turned off, the class is archived or the school is suspended.
 * Valid tokens slide: at most one write per token per day extends expiry (7 days teacher, 60 days student).
 */
export async function attachAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const m = typeof header === 'string' ? /^Bearer\s+([0-9a-f]{64})$/i.exec(header.trim()) : null;
    if (m) {
      const token = m[1]!.toLowerCase();
      const db = getDb();
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const row = await db.get<TokenRow>(
        `SELECT t.role, t.last_used_at, t.teacher_id, t.student_id,
                te.school_id AS t_school, te.role AS t_role, te.active AS t_active, ts.status AS t_status,
                s.class_id, s.active AS s_active, c.archived AS c_archived, c.school_id AS s_school, ss.status AS s_status
           FROM auth_tokens t
           LEFT JOIN teachers te ON te.id = t.teacher_id
           LEFT JOIN schools ts ON ts.id = te.school_id
           LEFT JOIN students s ON s.id = t.student_id
           LEFT JOIN classes c ON c.id = s.class_id
           LEFT JOIN schools ss ON ss.id = c.school_id
          WHERE t.token = ? AND t.expires_at > ?`,
        [token, nowIso],
      );
      let ok = false;
      if (row?.role === 'teacher' && row.teacher_id !== null && row.t_school !== null && row.t_active === 1 && row.t_status === 'active') {
        req.auth = { role: 'teacher', teacherId: row.teacher_id, schoolId: row.t_school, staffRole: row.t_role!, token };
        ok = true;
      } else if (
        row?.role === 'student' && row.student_id !== null && row.class_id !== null && row.s_school !== null &&
        row.s_active === 1 && row.c_archived === 0 && row.s_status === 'active'
      ) {
        req.auth = { role: 'student', studentId: row.student_id, classId: row.class_id, schoolId: row.s_school, token };
        ok = true;
      }
      if (ok && (row!.last_used_at === null || now - Date.parse(row!.last_used_at) > RENEW_AFTER_MS)) {
        const days = row!.role === 'teacher' ? TEACHER_TOKEN_DAYS : STUDENT_TOKEN_DAYS;
        await db.run('UPDATE auth_tokens SET last_used_at = ?, expires_at = ? WHERE token = ?', [nowIso, new Date(now + days * 86_400_000).toISOString(), token]);
        if (row!.role === 'student') await db.run('UPDATE students SET last_login_at = ? WHERE id = ?', [nowIso, row!.student_id]);
        else await db.run('UPDATE teachers SET last_login_at = ? WHERE id = ?', [nowIso, row!.teacher_id]);
      }
    }
    maybeCleanup();
  } catch (err) {
    // A DB failure must not look like "not logged in": surface it as a 500 instead of a misleading 401.
    console.error('[auth] token lookup failed', err);
    next(err);
    return;
  }
  next();
}

/** 401 unless req.auth.role === 'teacher' (any staff member, including school admins). */
export function requireTeacher(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'teacher') return next(unauthorized());
  next();
}

/** 401 unless req.auth.role === 'student'. */
export function requireStudent(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'student') return next(unauthorized());
  next();
}
