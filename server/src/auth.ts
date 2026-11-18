/**
 * Auth primitives + middleware. OWNER: Lane A (server).
 * Bearer tokens stored in auth_tokens (opaque random hex). No JWT, no cookies.
 */
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from './db/db.ts';
import { notFound, unauthorized } from './http.ts';

export interface TeacherAuth { role: 'teacher'; teacherId: number; token: string }
export interface StudentAuth { role: 'student'; studentId: number; classId: number; token: string }
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

/** Avatar emoji pool; pick deterministically by roll number so cards are stable. */
export const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🐘', '🦒', '🐢', '🐬', '🦉', '🐝', '🦋', '🐞', '🐧', '🐨', '🦓', '🐰', '🐻', '🦚'] as const;

export function avatarFor(rollNo: number): string {
  return AVATARS[(((rollNo - 1) % AVATARS.length) + AVATARS.length) % AVATARS.length]!;
}

/** Create and store a token; returns it. */
export async function issueToken(role: 'teacher' | 'student', id: number): Promise<string> {
  const token = newToken();
  const days = role === 'teacher' ? TEACHER_TOKEN_DAYS : STUDENT_TOKEN_DAYS;
  const expires = new Date(Date.now() + days * 86_400_000).toISOString();
  await getDb().run('INSERT INTO auth_tokens (token, role, teacher_id, student_id, expires_at) VALUES (?, ?, ?, ?, ?)', [
    token, role, role === 'teacher' ? id : null, role === 'student' ? id : null, expires,
  ]);
  return token;
}

interface TokenRow { role: 'teacher' | 'student'; teacher_id: number | null; student_id: number | null; class_id: number | null; active: number | null }

/** Resolves Authorization: Bearer <token> into req.auth (if valid and unexpired). Never rejects. */
export async function attachAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const m = typeof header === 'string' ? /^Bearer\s+([0-9a-f]{64})$/i.exec(header.trim()) : null;
    if (m) {
      const token = m[1]!.toLowerCase();
      const row = await getDb().get<TokenRow>(
        `SELECT t.role, t.teacher_id, t.student_id, s.class_id, s.active
           FROM auth_tokens t LEFT JOIN students s ON s.id = t.student_id
          WHERE t.token = ? AND t.expires_at > ?`,
        [token, new Date().toISOString()],
      );
      if (row?.role === 'teacher' && row.teacher_id !== null) {
        req.auth = { role: 'teacher', teacherId: row.teacher_id, token };
      } else if (row?.role === 'student' && row.student_id !== null && row.class_id !== null && row.active === 1) {
        req.auth = { role: 'student', studentId: row.student_id, classId: row.class_id, token };
      }
    }
  } catch (err) {
    // A DB failure must not look like "not logged in": surface it as a 500 instead of a misleading 401.
    console.error('[auth] token lookup failed', err);
    next(err);
    return;
  }
  next();
}

/** 401 unless req.auth.role === 'teacher'. */
export function requireTeacher(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'teacher') return next(unauthorized());
  next();
}

/** 401 unless req.auth.role === 'student'. */
export function requireStudent(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'student') return next(unauthorized());
  next();
}

/** Throws 404 unless the class belongs to the authenticated teacher (other teachers' classes are not revealed). */
export async function assertTeacherOwnsClass(teacherId: number, classId: number): Promise<void> {
  const row = await getDb().get('SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?', [classId, teacherId]);
  if (!row) throw notFound('Class not found');
}

/** Throws 404 unless the student is in one of the teacher's classes. */
export async function assertTeacherOwnsStudent(teacherId: number, studentId: number): Promise<void> {
  const row = await getDb().get('SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.teacher_id = ?', [
    studentId, teacherId,
  ]);
  if (!row) throw notFound('Student not found');
}
