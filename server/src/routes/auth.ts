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

async function schoolOf(id: number): Promise<{ id: number; name: string }> {
  const r = await getDb().get<{ id: number; name: string }>('SELECT id, name FROM schools WHERE id = ?', [id]);
  return r ?? { id, name: '' };
}

const teacherRegister: H<{}, TeacherAuthRes, TeacherRegisterReq> = async (req, res) => {
  const b = asObject(req.body);
  const name = reqString(b, 'name', 1, 80);
  const email = reqString(b, 'email', 3, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('email must be a valid email address');
  if (typeof b.password !== 'string' || b.password.length < 8) throw badRequest('password must be at least 8 characters');
  // O1 TEMPORARY SHIM (O2 replaces with real invite redemption, see docs/ONBOARDING_SPEC.md 4.4):
  // join the school of a valid teacher/admin invite, else fall back to the first (or a new default) school.
  const db = getDb();
  const code = typeof b.inviteCode === 'string' ? b.inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const inv = code
    ? await db.get<{ school_id: number }>(
        "SELECT school_id FROM invites WHERE code = ? AND kind IN ('teacher','school_admin') AND revoked_at IS NULL AND expires_at > ?",
        [code, new Date().toISOString()],
      )
    : undefined;
  let schoolId = inv?.school_id;
  if (schoolId === undefined) {
    const first = await db.get<{ id: number }>('SELECT min(id) AS id FROM schools');
    schoolId = first?.id ?? Number((await db.run("INSERT INTO schools (name, district, student_code) VALUES ('My School', '', shabd_rand_code(6)) RETURNING id")).rows[0]!.id);
  }
  const taken = new HttpError(409, 'conflict', 'This email is already registered');
  if (await db.get('SELECT 1 FROM teachers WHERE lower(email) = lower(?)', [email])) throw taken;
  let ins;
  try {
    ins = await db.run('INSERT INTO teachers (name, email, password_hash, school_id) VALUES (?, ?, ?, ?) RETURNING *', [name, email, hashPassword(b.password), schoolId]);
  } catch (e) {
    if (isUniqueViolation(e)) throw taken; // two simultaneous registrations of the same email
    throw e;
  }
  const teacher = teacherOf(ins.rows[0]!);
  res.status(201).json({ token: await issueToken('teacher', teacher.id), teacher, school: await schoolOf(schoolId) });
};

const teacherLogin: H<{}, TeacherAuthRes, TeacherLoginReq> = async (req, res) => {
  const b = asObject(req.body);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const row = await getDb().get('SELECT * FROM teachers WHERE lower(email) = lower(?)', [email]);
  const ok = verifyPassword(password, row ? (row.password_hash as string) : DUMMY_HASH);
  if (!row || !ok) throw unauthorized('Wrong email or password');
  const teacher = teacherOf(row);
  res.json({ token: await issueToken('teacher', teacher.id), teacher, school: await schoolOf(teacher.schoolId) });
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
  const firstLogin = st.first_login_at === null;
  const nowIso = new Date(now).toISOString();
  await db.run('UPDATE students SET failed_pin_count = 0, locked_until = NULL, first_login_at = COALESCE(first_login_at, ?), last_login_at = ? WHERE id = ?', [nowIso, nowIso, studentId]);
  const school = await schoolOf(cls.school_id as number);
  res.json({
    token: await issueToken('student', studentId), student: studentOf(st), className: cls.name as string,
    schoolName: school.name, classCode: cls.class_code as string, firstLogin,
  });
};

const me: H<{}, MeRes> = async (req, res) => {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  const db = getDb();
  if (auth.role === 'teacher') {
    const t = await db.get('SELECT * FROM teachers WHERE id = ?', [auth.teacherId]);
    if (!t) throw unauthorized();
    res.json({ role: 'teacher', teacher: teacherOf(t), school: await schoolOf(t.school_id as number) });
    return;
  }
  const st = await db.get('SELECT * FROM students WHERE id = ?', [auth.studentId]);
  const cls = await db.get('SELECT * FROM classes WHERE id = ?', [auth.classId]);
  if (!st || !cls) throw unauthorized();
  const c = classOf(cls);
  res.json({
    role: 'student', student: studentOf(st), classRoom: { id: c.id, name: c.name, leaderboardMode: c.leaderboardMode },
    schoolName: (await schoolOf(c.schoolId)).name,
  });
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
