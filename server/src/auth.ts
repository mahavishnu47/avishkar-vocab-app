/**
 * Auth primitives + middleware. OWNER: Lane A (server).
 * Bearer tokens stored in auth_tokens (opaque random hex). No JWT, no cookies.
 */
import type { NextFunction, Request, Response } from 'express';

export interface TeacherAuth { role: 'teacher'; teacherId: number; token: string }
export interface StudentAuth { role: 'student'; studentId: number; classId: number; token: string }
export type AuthContext = TeacherAuth | StudentAuth;

declare module 'express-serve-static-core' {
  interface Request { auth?: AuthContext }
}

/** 'scrypt$<saltHex>$<hashHex>' using node:crypto scryptSync (N=16384, 64-byte key). */
export function hashPassword(password: string): string { void password; throw new Error('not implemented'); }
export function verifyPassword(password: string, stored: string): boolean { void password; void stored; throw new Error('not implemented'); }
/** 32 random bytes as hex */
export function newToken(): string { throw new Error('not implemented'); }
/** 6 chars from 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' (no 0/O/1/I); caller retries on UNIQUE clash */
export function generateClassCode(): string { throw new Error('not implemented'); }
/** 4 random digits, '0000'-'9999', avoiding trivially guessable 0000/1111/1234 */
export function generatePin(): string { throw new Error('not implemented'); }
/** Avatar emoji pool; pick deterministically by roll number so cards are stable. */
export const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🐘', '🦒', '🐢', '🐬', '🦉', '🐝', '🦋', '🐞', '🐧', '🐨', '🦓', '🐰', '🐻', '🦚'] as const;

/** Resolves Authorization: Bearer <token> into req.auth (if valid and unexpired). Never rejects. */
export function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  void req;
  next(); // TODO(Lane A): look up auth_tokens
}

/** 401 unless req.auth.role === 'teacher'. */
export function requireTeacher(req: Request, res: Response, next: NextFunction): void {
  void req; void res;
  next(); // TODO(Lane A)
}

/** 401 unless req.auth.role === 'student'. */
export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  void req; void res;
  next(); // TODO(Lane A)
}

/** Throws 403/404 unless the class belongs to the authenticated teacher. */
export function assertTeacherOwnsClass(teacherId: number, classId: number): void {
  void teacherId; void classId;
  throw new Error('not implemented');
}

/** Throws 403/404 unless the student is in one of the teacher's classes. */
export function assertTeacherOwnsStudent(teacherId: number, studentId: number): void {
  void teacherId; void studentId;
  throw new Error('not implemented');
}
