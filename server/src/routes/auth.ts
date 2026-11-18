/**
 * Auth routes. OWNER: Lane A. Contract: docs/API.md section 2.
 */
import { Router } from 'express';
import type {
  MeRes, PublicRosterRes, StudentAuthRes, StudentLoginReq, TeacherAuthRes, TeacherLoginReq, TeacherRegisterReq,
} from '@shabd/core';
import { hashPassword, issueToken, verifyPassword } from '../auth.ts';
import { getDb, isUniqueViolation } from '../db/db.ts';
import { HttpError, badRequest, forbidden, notFound, unauthorized, type H } from '../http.ts';
import { classOf, studentOf, teacherOf } from '../mappers.ts';
import { asObject, reqInt, reqString } from '../validate.ts';

export const authRouter = Router();

const MAX_PIN_FAILS = 5;
const LOCK_MS = 5 * 60_000;

// A valid hash used to equalise timing when the email is unknown.
const DUMMY_HASH = hashPassword('not-a-real-password');

const teacherRegister: H<{}, TeacherAuthRes, TeacherRegisterReq> = async (req, res) => {
  const b = asObject(req.body);
  const name = reqString(b, 'name', 1, 80);
  const email = reqString(b, 'email', 3, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('email must be a valid email address');
  if (typeof b.password !== 'string' || b.password.length < 8) throw badRequest('password must be at least 8 characters');
  const invite = process.env.TEACHER_INVITE_CODE;
  if (invite && b.inviteCode !== invite) throw forbidden('Invite code is wrong');
  const db = getDb();
  const taken = new HttpError(409, 'conflict', 'This email is already registered');
  if (await db.get('SELECT 1 FROM teachers WHERE lower(email) = lower(?)', [email])) throw taken;
  let ins;
  try {
    ins = await db.run('INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?) RETURNING id', [name, email, hashPassword(b.password)]);
  } catch (e) {
    if (isUniqueViolation(e)) throw taken; // two simultaneous registrations of the same email
    throw e;
  }
  const teacher = { id: Number(ins.rows[0]!.id), name, email };
  res.status(201).json({ token: await issueToken('teacher', teacher.id), teacher });
};

const teacherLogin: H<{}, TeacherAuthRes, TeacherLoginReq> = async (req, res) => {
  const b = asObject(req.body);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const row = await getDb().get('SELECT * FROM teachers WHERE lower(email) = lower(?)', [email]);
  const ok = verifyPassword(password, row ? (row.password_hash as string) : DUMMY_HASH);
  if (!row || !ok) throw unauthorized('Wrong email or password');
  const teacher = teacherOf(row);
  res.json({ token: await issueToken('teacher', teacher.id), teacher });
};

const publicRoster: H<{ classCode: string }, PublicRosterRes> = async (req, res) => {
  const db = getDb();
  const cls = await db.get<{ id: number; name: string }>('SELECT id, name FROM classes WHERE class_code = ?', [req.params.classCode.toUpperCase()]);
  if (!cls) throw notFound('Class code not found');
  const students = await db.all<{ id: number; first_name: string; avatar: string }>(
    'SELECT id, first_name, avatar FROM students WHERE class_id = ? AND active = 1 ORDER BY lower(first_name), id',
    [cls.id],
  );
  res.json({ className: cls.name, students: students.map((s) => ({ id: s.id, firstName: s.first_name, avatar: s.avatar })) });
};

const studentLogin: H<{}, StudentAuthRes, StudentLoginReq> = async (req, res) => {
  const b = asObject(req.body);
  const classCode = reqString(b, 'classCode', 1, 20).toUpperCase();
  const studentId = reqInt(b, 'studentId', 1);
  const pin = typeof b.pin === 'string' ? b.pin.trim() : '';
  const db = getDb();
  const cls = await db.get('SELECT * FROM classes WHERE class_code = ?', [classCode]);
  const st = cls ? await db.get('SELECT * FROM students WHERE id = ? AND class_id = ? AND active = 1', [studentId, cls.id]) : undefined;
  if (!cls || !st) throw notFound('Student not found in this class');

  const now = Date.now();
  const lockedUntil = st.locked_until as string | null;
  if (lockedUntil && Date.parse(lockedUntil) > now) {
    throw new HttpError(423, 'locked', 'Too many wrong PINs. Please ask your teacher or try again in a few minutes');
  }
  if (pin !== st.pin) {
    const fails = (st.failed_pin_count as number) + 1;
    if (fails >= MAX_PIN_FAILS) {
      await db.run('UPDATE students SET failed_pin_count = 0, locked_until = ? WHERE id = ?', [new Date(now + LOCK_MS).toISOString(), studentId]);
    } else {
      await db.run('UPDATE students SET failed_pin_count = ? WHERE id = ?', [fails, studentId]);
    }
    throw unauthorized('Wrong PIN');
  }
  await db.run('UPDATE students SET failed_pin_count = 0, locked_until = NULL WHERE id = ?', [studentId]);
  res.json({ token: await issueToken('student', studentId), student: studentOf(st), className: cls.name as string });
};

const me: H<{}, MeRes> = async (req, res) => {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  const db = getDb();
  if (auth.role === 'teacher') {
    const t = await db.get('SELECT * FROM teachers WHERE id = ?', [auth.teacherId]);
    if (!t) throw unauthorized();
    res.json({ role: 'teacher', teacher: teacherOf(t) });
    return;
  }
  const st = await db.get('SELECT * FROM students WHERE id = ?', [auth.studentId]);
  const cls = await db.get('SELECT * FROM classes WHERE id = ?', [auth.classId]);
  if (!st || !cls) throw unauthorized();
  const c = classOf(cls);
  res.json({ role: 'student', student: studentOf(st), classRoom: { id: c.id, name: c.name, leaderboardMode: c.leaderboardMode } });
};

const logout: H<{}, void> = async (req, res) => {
  if (!req.auth) throw unauthorized();
  await getDb().run('DELETE FROM auth_tokens WHERE token = ?', [req.auth.token]);
  res.status(204).end();
};

authRouter.post('/auth/teacher/register', teacherRegister);
authRouter.post('/auth/teacher/login', teacherLogin);
authRouter.get('/auth/classes/:classCode/roster', publicRoster);
authRouter.post('/auth/student/login', studentLogin);
authRouter.get('/auth/me', me);
authRouter.post('/auth/logout', logout);
