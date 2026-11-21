/**
 * Tenant isolation lives here. Every class or student access by a staff member goes through these helpers;
 * anything outside the caller's scope is a 404 (never 403) so nothing leaks. Also the school-admin and
 * super-admin gates. Contract: docs/ONBOARDING_SPEC.md 4.2.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { TeacherAuth } from './auth.ts';
import { getDb, type Row } from './db/db.ts';
import { forbidden, notFound, unauthorized } from './http.ts';
import { checkLimit, clientKey, recordHit } from './services/rateLimit.ts';

/** The authenticated staff member; throws 401 for anything else. */
export function staffAuth(req: Request): TeacherAuth {
  if (req.auth?.role !== 'teacher') throw unauthorized();
  return req.auth;
}

const isAdmin = (a: TeacherAuth) => a.staffRole === 'school_admin';

/** Returns the class row if the staff member owns it, or is a school admin of its school. Otherwise 404. */
export async function assertCanAccessClass(auth: TeacherAuth, classId: number): Promise<Row> {
  const row = await getDb().get(
    'SELECT * FROM classes WHERE id = ? AND (teacher_id = ? OR (? AND school_id = ?))',
    [classId, auth.teacherId, isAdmin(auth), auth.schoolId],
  );
  if (!row) throw notFound('Class not found');
  return row;
}

/** Returns the student row if the student's class is accessible to the staff member. Otherwise 404. */
export async function assertCanAccessStudent(auth: TeacherAuth, studentId: number): Promise<Row> {
  const row = await getDb().get(
    `SELECT s.* FROM students s JOIN classes c ON c.id = s.class_id
      WHERE s.id = ? AND (c.teacher_id = ? OR (? AND c.school_id = ?))`,
    [studentId, auth.teacherId, isAdmin(auth), auth.schoolId],
  );
  if (!row) throw notFound('Student not found');
  return row;
}

/** 401 without a staff token, 403 for a plain teacher. */
export function requireSchoolAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'teacher') return next(unauthorized());
  if (req.auth.staffRole !== 'school_admin') return next(forbidden('This is for school admins only'));
  next();
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Super admin gate: 404 when SUPER_ADMIN_SECRET is unset or shorter than 16 characters (feature off); otherwise
 * X-Admin-Secret must match (constant time). Failures count toward the `admin` rate limit.
 */
export async function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const secret = process.env.SUPER_ADMIN_SECRET;
    if (!secret || secret.length < 16) throw notFound();
    const ip = clientKey(req);
    await checkLimit('admin', ip);
    const sent = req.headers['x-admin-secret'];
    const ok = typeof sent === 'string' && timingSafeEqual(digest(sent), digest(secret));
    if (!ok) {
      await recordHit('admin', ip);
      throw unauthorized('Wrong admin secret');
    }
    next();
  } catch (e) {
    next(e);
  }
}
