/**
 * Auth routes. OWNER: Lane A. Contract: docs/API.md section 2.
 */
import { Router } from 'express';
import type {
  MeRes, PublicRosterRes, StudentAuthRes, StudentLoginReq, TeacherAuthRes, TeacherLoginReq, TeacherRegisterReq,
} from '@shabd/core';
import { hashPassword, issueToken, verifyPassword } from '../auth.ts';
import { getDb } from '../db/db.ts';
import { HttpError, badRequest, forbidden, notFound, unauthorized, type H } from '../http.ts';
import { classOf, studentOf, teacherOf } from '../mappers.ts';
import { asObject, reqInt, reqString } from '../validate.ts';

export const authRouter = Router();

const MAX_PIN_FAILS = 5;
const LOCK_MS = 5 * 60_000;

// A valid hash used to equalise timing when the email is unknown.
const DUMMY_HASH = hashPassword('not-a-real-password');

const teacherRegister: H<{}, TeacherAuthRes, TeacherRegisterReq> = (req, res) => {
  const b = asObject(req.body);
  const name = reqString(b, 'name', 1, 80);
  const email = reqString(b, 'email', 3, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('email must be a valid email address');
  if (typeof b.password !== 'string' || b.password.length < 8) throw badRequest('password must be at least 8 characters');
  const invite = process.env.TEACHER_INVITE_CODE;
  if (invite && b.inviteCode !== invite) throw forbidden('Invite code is wrong');
  const db = getDb();
  if (db.prepare('SELECT 1 FROM teachers WHERE email = ?').get(email)) throw new HttpError(409, 'conflict', 'This email is already registered');
  const info = db.prepare('INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hashPassword(b.password));
  const teacher = { id: Number(info.lastInsertRowid), name, email };
  res.status(201).json({ token: issueToken('teacher', teacher.id), teacher });
};

const teacherLogin: H<{}, TeacherAuthRes, TeacherLoginReq> = (req, res) => {
  const b = asObject(req.body);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const row = getDb().prepare('SELECT * FROM teachers WHERE email = ?').get(email) as Record<string, unknown> | undefined;
  const ok = verifyPassword(password, row ? (row.password_hash as string) : DUMMY_HASH);
  if (!row || !ok) throw unauthorized('Wrong email or password');
  const teacher = teacherOf(row);
  res.json({ token: issueToken('teacher', teacher.id), teacher });
};

const publicRoster: H<{ classCode: string }, PublicRosterRes> = (req, res) => {
  const db = getDb();
  const cls = db.prepare('SELECT id, name FROM classes WHERE class_code = ?').get(req.params.classCode.toUpperCase()) as
    | { id: number; name: string } | undefined;
  if (!cls) throw notFound('Class code not found');
  const students = db
    .prepare('SELECT id, first_name, avatar FROM students WHERE class_id = ? AND active = 1 ORDER BY first_name COLLATE NOCASE, id')
    .all(cls.id) as { id: number; first_name: string; avatar: string }[];
  res.json({ className: cls.name, students: students.map((s) => ({ id: s.id, firstName: s.first_name, avatar: s.avatar })) });
};

const studentLogin: H<{}, StudentAuthRes, StudentLoginReq> = (req, res) => {
  const b = asObject(req.body);
  const classCode = reqString(b, 'classCode', 1, 20).toUpperCase();
  const studentId = reqInt(b, 'studentId', 1);
  const pin = typeof b.pin === 'string' ? b.pin.trim() : '';
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE class_code = ?').get(classCode) as Record<string, unknown> | undefined;
  const st = cls
    ? (db.prepare('SELECT * FROM students WHERE id = ? AND class_id = ? AND active = 1').get(studentId, cls.id) as Record<string, unknown> | undefined)
    : undefined;
  if (!cls || !st) throw notFound('Student not found in this class');

  const now = Date.now();
  const lockedUntil = st.locked_until as string | null;
  if (lockedUntil && Date.parse(lockedUntil) > now) {
    throw new HttpError(423, 'locked', 'Too many wrong PINs. Please ask your teacher or try again in a few minutes');
  }
  if (pin !== st.pin) {
    const fails = (st.failed_pin_count as number) + 1;
    if (fails >= MAX_PIN_FAILS) {
      db.prepare('UPDATE students SET failed_pin_count = 0, locked_until = ? WHERE id = ?').run(new Date(now + LOCK_MS).toISOString(), studentId);
    } else {
      db.prepare('UPDATE students SET failed_pin_count = ? WHERE id = ?').run(fails, studentId);
    }
    throw unauthorized('Wrong PIN');
  }
  db.prepare('UPDATE students SET failed_pin_count = 0, locked_until = NULL WHERE id = ?').run(studentId);
  res.json({ token: issueToken('student', studentId), student: studentOf(st), className: cls.name as string });
};

const me: H<{}, MeRes> = (req, res) => {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  const db = getDb();
  if (auth.role === 'teacher') {
    const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(auth.teacherId) as Record<string, unknown> | undefined;
    if (!t) throw unauthorized();
    res.json({ role: 'teacher', teacher: teacherOf(t) });
    return;
  }
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(auth.studentId) as Record<string, unknown> | undefined;
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(auth.classId) as Record<string, unknown> | undefined;
  if (!st || !cls) throw unauthorized();
  const c = classOf(cls);
  res.json({ role: 'student', student: studentOf(st), classRoom: { id: c.id, name: c.name, leaderboardMode: c.leaderboardMode } });
};

const logout: H<{}, void> = (req, res) => {
  if (!req.auth) throw unauthorized();
  getDb().prepare('DELETE FROM auth_tokens WHERE token = ?').run(req.auth.token);
  res.status(204).end();
};

authRouter.post('/auth/teacher/register', teacherRegister);
authRouter.post('/auth/teacher/login', teacherLogin);
authRouter.get('/auth/classes/:classCode/roster', publicRoster);
authRouter.post('/auth/student/login', studentLogin);
authRouter.get('/auth/me', me);
authRouter.post('/auth/logout', logout);
