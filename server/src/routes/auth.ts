/**
 * Auth routes (teacher register/login/setup/reset, student login, invite lookup). Contract: docs/ONBOARDING_SPEC.md 4.4.
 */
import { Router, type Request } from 'express';
import type {
  InviteInfoRes, InviteKind, MeRes, PasswordResetReq, PublicRosterRes, SchoolSetupReq, StudentAuthRes, StudentLoginReq,
  TeacherAuthRes, TeacherLoginReq, TeacherRegisterReq,
} from '@shabd/core';
import { hashPassword, issueToken, verifyPassword } from '../auth.ts';
import { getDb, isUniqueViolation, type Queryable, type Row } from '../db/db.ts';
import { HttpError, badRequest, forbidden, notFound, unauthorized, type H } from '../http.ts';
import { classOf, studentOf, teacherOf } from '../mappers.ts';
import { audit } from '../services/audit.ts';
import { DAY_MS, DEFAULT_TEACHER_INVITE_USES, consumeInvite, createInvite, findUsableInvite, liveTeacherInvite, notValid } from '../services/invites.ts';
import { checkLimit, clientKey, hashExtra, hit, recordHit } from '../services/rateLimit.ts';
import { findJoinableClass } from '../services/join.ts';
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

/** Shared field checks for register / setup. */
function accountFields(b: Record<string, unknown>): { name: string; email: string; password: string } {
  const name = reqString(b, 'name', 1, 80);
  const email = reqString(b, 'email', 3, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('email must be a valid email address');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) throw badRequest('password must be at least 8 characters');
  return { name, email, password: b.password };
}

const EMAIL_TAKEN = 'This email is already registered. Log in instead.';

/**
 * Redeem an invite (teacher join or school setup) in one transaction: lock the invite, create the teacher,
 * count the use, write audit rows. `after` runs inside the transaction (setup makes the first teacher invite).
 */
async function redeemIntoTeacher(
  req: Request, rawCode: unknown, kinds: InviteKind[], who: { name: string; email: string; password: string },
  after?: (q: Queryable, inv: Row, teacherId: number) => Promise<void>,
): Promise<TeacherAuthRes> {
  const ip = clientKey(req);
  await checkLimit('invite', ip);
  const db = getDb();
  let out: TeacherAuthRes | null = null;
  try {
    out = await db.tx(async (q) => {
      const inv = await findUsableInvite(q, rawCode, kinds, true);
      if (!inv) return null;
      if (await q.get('SELECT 1 FROM teachers WHERE lower(email) = lower(?)', [who.email])) throw new HttpError(409, 'conflict', EMAIL_TAKEN);
      const role = inv.kind === 'school_admin' ? 'school_admin' : 'teacher';
      const ins = await q.run(
        'INSERT INTO teachers (name, email, password_hash, school_id, role, last_login_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
        [who.name, who.email, hashPassword(who.password), inv.school_id, role, new Date().toISOString()],
      );
      const teacher = teacherOf(ins.rows[0]!);
      await consumeInvite(q, inv.id as number);
      const schoolId = inv.school_id as number;
      await audit(q, { schoolId, actorType: 'teacher', actorId: teacher.id, action: 'invite.redeem', targetType: 'invite', targetId: inv.id as number, meta: { kind: inv.kind as string } });
      await audit(q, { schoolId, actorType: 'teacher', actorId: teacher.id, action: 'teacher.join', targetType: 'teacher', targetId: teacher.id, meta: { role } });
      if (after) await after(q, inv, teacher.id);
      return { token: await issueToken('teacher', teacher.id, q), teacher, school: { id: schoolId, name: inv.school_name } };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, 'conflict', EMAIL_TAKEN); // two simultaneous registrations of the same email
    throw e;
  }
  if (!out) {
    await recordHit('invite', ip);
    throw notValid('This code is not valid. Ask your school admin for a new one.');
  }
  return out;
}

const teacherRegister: H<{}, TeacherAuthRes, TeacherRegisterReq> = async (req, res) => {
  const b = asObject(req.body);
  const who = accountFields(b);
  if (typeof b.inviteCode !== 'string' || b.inviteCode.trim() === '') throw badRequest('inviteCode is required');
  res.status(201).json(await redeemIntoTeacher(req, b.inviteCode, ['teacher', 'school_admin'], who));
};

const schoolSetup: H<{}, TeacherAuthRes, SchoolSetupReq> = async (req, res) => {
  const b = asObject(req.body);
  const who = accountFields(b);
  if (typeof b.code !== 'string' || b.code.trim() === '') throw badRequest('code is required');
  res.status(201).json(
    await redeemIntoTeacher(req, b.code, ['school_admin'], who, async (q, inv, teacherId) => {
      // The school's first teacher invite, ready to share. Not made again when a live one already exists (second admin).
      const schoolId = inv.school_id as number;
      if (!(await liveTeacherInvite(q, schoolId))) {
        const t = await createInvite(q, { kind: 'teacher', schoolId, createdByTeacherId: teacherId, maxUses: DEFAULT_TEACHER_INVITE_USES, ttlMs: 30 * DAY_MS });
        await audit(q, { schoolId, actorType: 'system', action: 'invite.create', targetType: 'invite', targetId: t.id as number, meta: { kind: 'teacher' } });
      }
    }),
  );
};

const teacherLogin: H<{}, TeacherAuthRes, TeacherLoginReq> = async (req, res) => {
  const b = asObject(req.body);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const ip = clientKey(req);
  const extra = hashExtra(email);
  await checkLimit('tlogin', ip, extra);
  const db = getDb();
  const row = await db.get('SELECT * FROM teachers WHERE lower(email) = lower(?)', [email]);
  const ok = verifyPassword(password, row ? (row.password_hash as string) : DUMMY_HASH);
  if (!row || !ok) {
    await recordHit('tlogin', ip, extra);
    throw unauthorized('Wrong email or password');
  }
  if (row.active !== 1) throw forbidden('Your account is turned off. Ask your school admin.');
  const school = await db.get<{ id: number; name: string; status: string }>('SELECT id, name, status FROM schools WHERE id = ?', [row.school_id]);
  if (!school || school.status !== 'active') throw forbidden('Your school is paused. Contact Shabd Mitra.');
  await db.run('UPDATE teachers SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
  const teacher = teacherOf(row);
  res.json({ token: await issueToken('teacher', teacher.id), teacher, school: { id: school.id, name: school.name } });
};

const passwordReset: H<{}, TeacherAuthRes, PasswordResetReq> = async (req, res) => {
  const b = asObject(req.body);
  if (typeof b.code !== 'string' || b.code.trim() === '') throw badRequest('code is required');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) throw badRequest('password must be at least 8 characters');
  const ip = clientKey(req);
  await checkLimit('invite', ip);
  const out = await getDb().tx(async (q) => {
    const inv = await findUsableInvite(q, b.code, ['password_reset'], true);
    const t = inv ? await q.get('SELECT * FROM teachers WHERE id = ? AND school_id = ? AND active = 1', [inv.teacher_id, inv.school_id]) : undefined;
    if (!inv || !t) return null;
    await q.run('UPDATE teachers SET password_hash = ?, last_login_at = ? WHERE id = ?', [hashPassword(b.password as string), new Date().toISOString(), t.id]);
    await q.run('DELETE FROM auth_tokens WHERE teacher_id = ?', [t.id]);
    await consumeInvite(q, inv.id as number);
    const schoolId = inv.school_id as number;
    await audit(q, { schoolId, actorType: 'teacher', actorId: t.id as number, action: 'invite.redeem', targetType: 'invite', targetId: inv.id as number, meta: { kind: 'password_reset' } });
    await audit(q, { schoolId, actorType: 'teacher', actorId: t.id as number, action: 'teacher.password_reset', targetType: 'teacher', targetId: t.id as number });
    const teacher = teacherOf(t);
    return { token: await issueToken('teacher', teacher.id, q), teacher, school: { id: schoolId, name: inv.school_name } } satisfies TeacherAuthRes;
  });
  if (!out) {
    await recordHit('invite', ip);
    throw notValid();
  }
  res.json(out);
};

const inviteInfo: H<{ code: string }, InviteInfoRes> = async (req, res) => {
  await hit('invite', clientKey(req));
  const db = getDb();
  const inv = await findUsableInvite(db, req.params.code, ['school_admin', 'teacher', 'password_reset']);
  if (!inv) throw notValid();
  let teacherName: string | undefined;
  if (inv.kind === 'password_reset') {
    teacherName = (await db.get<{ name: string }>('SELECT name FROM teachers WHERE id = ?', [inv.teacher_id]))?.name;
  }
  res.json({ kind: inv.kind as InviteKind, schoolName: inv.school_name, expiresAt: inv.expires_at as string, ...(teacherName ? { teacherName } : {}) });
};

const publicRoster: H<{ classCode: string }, PublicRosterRes> = async (req, res) => {
  await hit('join', clientKey(req));
  const db = getDb();
  const cls = await findJoinableClass(db, req.params.classCode);
  if (!cls) throw notFound('Class not found');
  const students = await db.all<{ id: number; first_name: string; avatar: string }>(
    'SELECT id, first_name, avatar FROM students WHERE class_id = ? AND active = 1 ORDER BY lower(first_name), id',
    [cls.id],
  );
  res.json({ className: cls.name as string, students: students.map((s) => ({ id: s.id, firstName: s.first_name, avatar: s.avatar })) });
};

const studentLogin: H<{}, StudentAuthRes, StudentLoginReq> = async (req, res) => {
  const b = asObject(req.body);
  const classCode = reqString(b, 'classCode', 1, 20);
  const studentId = reqInt(b, 'studentId', 1);
  const pin = typeof b.pin === 'string' ? b.pin.trim() : '';
  const db = getDb();
  const ip = clientKey(req);
  const cls = await findJoinableClass(db, classCode);
  const st = cls ? await db.get('SELECT * FROM students WHERE id = ? AND class_id = ? AND active = 1', [studentId, cls.id]) : undefined;
  if (!cls || !st) throw notFound('Student not found in this class');

  const now = Date.now();
  const lockedUntil = st.locked_until as string | null;
  if (lockedUntil && Date.parse(lockedUntil) > now) {
    throw new HttpError(423, 'locked', 'Too many wrong PINs. Please ask your teacher or try again in a few minutes');
  }
  await checkLimit('pin', ip); // before the comparison; only wrong PINs count
  if (pin !== st.pin) {
    await recordHit('pin', ip);
    const fails = (st.failed_pin_count as number) + 1;
    if (fails >= MAX_PIN_FAILS) {
      await db.run('UPDATE students SET failed_pin_count = 0, locked_until = ? WHERE id = ?', [new Date(now + LOCK_MS).toISOString(), studentId]);
      await audit(db, { schoolId: cls.school_id as number, actorType: 'system', action: 'student.lockout', targetType: 'student', targetId: studentId });
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
authRouter.post('/auth/school/setup', schoolSetup);
authRouter.post('/auth/password-reset', passwordReset);
authRouter.get('/invites/:code', inviteInfo);
authRouter.post('/auth/teacher/login', teacherLogin);
authRouter.get('/auth/classes/:classCode/roster', publicRoster);
authRouter.post('/auth/student/login', studentLogin);
authRouter.get('/auth/me', me);
authRouter.post('/auth/logout', logout);
