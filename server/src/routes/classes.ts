/**
 * Classes, roster, teacher overview, share info. Staff only; every class/student access goes through tenancy.ts.
 * Contract: docs/ONBOARDING_SPEC.md 4.5.
 */
import { Router } from 'express';
import type {
  AddStudentsReq, ClassRoom, CreateClassReq, ResetPinReq, RosterRes, RosterStudent, ShareInfoRes, TeacherOverviewRes,
  UpdateClassReq, UpdateStudentReq,
} from '@shabd/core';
import { academicYearFor, className as makeClassName, classJoinText, joinPath, schoolJoinPath } from '@shabd/core';
import { avatarFor, generateClassCode, generatePin, requireTeacher } from '../auth.ts';
import { today } from '../clock.ts';
import { getDb, isUniqueViolation } from '../db/db.ts';
import { HttpError, badRequest, type H } from '../http.ts';
import { classOf, getClassRow, rosterStudentOf } from '../mappers.ts';
import { audit } from '../services/audit.ts';
import { baseUrl } from '../services/invites.ts';
import { assertClassSlotFree, classSummaries } from '../services/schools.ts';
import { assertCanAccessClass, assertCanAccessStudent, staffAuth } from '../tenancy.ts';
import { asObject, idParam, optDate, optInt, optString, reqDate, reqInt, reqString } from '../validate.ts';

export const classesRouter = Router();
classesRouter.use(['/classes', '/students', '/teacher'], requireTeacher);

const MAX_STUDENTS_PER_REQUEST = 100;

/** Defence in depth: only the first whitespace-separated word of a name is kept. */
const firstWord = (s: string): string => s.trim().split(/\s+/)[0] ?? '';

const listClasses: H<{}, ClassRoom[], unknown, { archived?: string }> = async (req, res) => {
  const a = staffAuth(req);
  const rows = await getDb().all(
    `SELECT * FROM classes WHERE teacher_id = ? ${req.query.archived === '1' ? '' : 'AND archived = 0'} ORDER BY id DESC`,
    [a.teacherId],
  );
  res.json(rows.map(classOf));
};

const teacherOverview: H<{}, TeacherOverviewRes> = async (req, res) => {
  const a = staffAuth(req);
  const db = getDb();
  const date = today();
  const me = (await db.get('SELECT * FROM teachers WHERE id = ?', [a.teacherId]))!;
  const school = (await db.get<{ id: number; name: string }>('SELECT id, name FROM schools WHERE id = ?', [a.schoolId]))!;
  const classes = await classSummaries(db, date, 'c.teacher_id = ? AND c.archived = 0', [a.teacherId]);
  const flags = (await db.get<{ students: number; shared: number; joined: number }>(
    `SELECT count(s.id) AS students,
            (SELECT count(*) FROM classes c2 WHERE c2.teacher_id = ? AND c2.link_shared_at IS NOT NULL) AS shared,
            count(s.first_login_at) AS joined
       FROM classes c LEFT JOIN students s ON s.class_id = c.id
      WHERE c.teacher_id = ?`,
    [a.teacherId, a.teacherId],
  ))!;
  const checklist = {
    classCreated: classes.length > 0 || (await db.get('SELECT 1 FROM classes WHERE teacher_id = ?', [a.teacherId])) !== undefined,
    studentsAdded: Number(flags.students) > 0,
    linkShared: Number(flags.shared) > 0,
    firstStudentJoined: Number(flags.joined) > 0,
    done: false,
  };
  checklist.done = checklist.classCreated && checklist.studentsAdded && checklist.linkShared && checklist.firstStudentJoined;
  res.json({
    teacher: { id: me.id as number, name: me.name as string, email: me.email as string, schoolId: a.schoolId, role: a.staffRole, active: true },
    school, date, classes, checklist,
  });
};

/** A class cannot start before 2020 or more than a year from now (1800-01-01 and 9999-12-31 used to be accepted, T-2). */
function classStartDate(d: string): string {
  const max = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
  if (d < '2020-01-01' || d > max) throw badRequest('startDate must be between 2020-01-01 and a year from today');
  return d;
}

const createClass: H<{}, ClassRoom, CreateClassReq> = async (req, res) => {
  const a = staffAuth(req);
  const b = asObject(req.body);
  let standard = optInt(b, 'standard', 1, 12);
  let division = (optString(b, 'division', 0, 3) ?? '').toUpperCase();
  if (b.division === '') division = '';
  if (!/^[A-Z0-9]{0,3}$/.test(division)) throw badRequest('division must be up to 3 letters or digits');
  let name = optString(b, 'name', 1, 40);
  if (standard === undefined) {
    if (name === undefined) throw badRequest('standard or name is required');
    // legacy { name }: parsed like the migration backfill, otherwise standard 5, no division
    const m = /^([0-9]{1,2})\s*-?\s*([A-Za-z]?)$/.exec(name.trim());
    const ok = m && Number(m[1]) >= 1 && Number(m[1]) <= 12;
    standard = ok ? Number(m[1]) : 5;
    division = ok ? m![2]!.toUpperCase() : '';
  }
  name ??= makeClassName(standard, division);
  const startDate = classStartDate(optDate(b.startDate, 'startDate') ?? today());
  const year = academicYearFor(startDate);
  const db = getDb();
  await assertClassSlotFree(db, a.schoolId, standard, division, year);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      // Not inside a transaction: a unique clash on class_code just retries with a new code.
      const ins = await db.run(
        'INSERT INTO classes (teacher_id, school_id, name, class_code, start_date, standard, division, academic_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        [a.teacherId, a.schoolId, name, generateClassCode(), startDate, standard, division, year],
      );
      const id = Number(ins.rows[0]!.id);
      await audit(db, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'class.create', targetType: 'class', targetId: id });
      res.status(201).json(classOf(await getClassRow(db, id)));
      return;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // two simultaneous "Create class" requests: the database index decides, the loser gets a normal 409 (T-1)
      if ((e as { constraint?: string }).constraint === 'classes_active_slot_uq') {
        throw new HttpError(409, 'conflict', `Class ${standard}${division} already exists in your school. Ask your school admin.`);
      }
    }
  }
  throw new HttpError(500, 'internal', 'Could not generate a class code');
};

const updateClass: H<{ classId: string }, ClassRoom, UpdateClassReq> = async (req, res) => {
  const a = staffAuth(req);
  const classId = idParam(req.params.classId);
  const cur = await assertCanAccessClass(a, classId);
  const b = asObject(req.body);
  const name = optString(b, 'name', 1, 40);
  const startDate = b.startDate === undefined ? undefined : classStartDate(reqDate(b.startDate, 'startDate'));
  const mode = b.leaderboardMode;
  if (mode !== undefined && mode !== 'individual' && mode !== 'hidden') throw badRequest("leaderboardMode must be 'individual' or 'hidden'");
  for (const f of ['joinEnabled', 'archived'] as const) {
    if (b[f] !== undefined && typeof b[f] !== 'boolean') throw badRequest(`${f} must be true or false`);
  }
  if (b.linkShared !== undefined && b.linkShared !== true) throw badRequest('linkShared must be true');
  const db = getDb();
  if (b.archived === false && cur.archived === 1) {
    await assertClassSlotFree(db, cur.school_id as number, cur.standard as number, cur.division as string, cur.academic_year as string, classId);
  }
  await db.run(
    `UPDATE classes SET name = COALESCE(?, name), start_date = COALESCE(?, start_date),
            leaderboard_mode = COALESCE(?, leaderboard_mode), join_enabled = COALESCE(?, join_enabled),
            archived = COALESCE(?, archived), link_shared_at = CASE WHEN ? THEN COALESCE(link_shared_at, ?) ELSE link_shared_at END
      WHERE id = ?`,
    [name ?? null, startDate ?? null, mode ?? null, b.joinEnabled === undefined ? null : b.joinEnabled ? 1 : 0,
      b.archived === undefined ? null : b.archived ? 1 : 0, b.linkShared === true, new Date().toISOString(), classId],
  );
  const sid = a.schoolId;
  if (b.joinEnabled !== undefined && (b.joinEnabled ? 1 : 0) !== cur.join_enabled) {
    await audit(db, { schoolId: sid, actorType: 'teacher', actorId: a.teacherId, action: 'class.join_toggle', targetType: 'class', targetId: classId, meta: { joinEnabled: b.joinEnabled as boolean } });
  }
  if (b.archived === true && cur.archived === 0) {
    await audit(db, { schoolId: sid, actorType: 'teacher', actorId: a.teacherId, action: 'class.archive', targetType: 'class', targetId: classId });
  }
  res.json(classOf(await getClassRow(db, classId)));
};

const rotateCode: H<{ classId: string }, ClassRoom> = async (req, res) => {
  const a = staffAuth(req);
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(a, classId);
  const db = getDb();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await db.run('UPDATE classes SET class_code = ? WHERE id = ?', [generateClassCode(), classId]);
      await audit(db, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'class.code_rotate', targetType: 'class', targetId: classId });
      res.json(classOf(await getClassRow(db, classId)));
      return;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new HttpError(500, 'internal', 'Could not generate a class code');
};

const shareInfo: H<{ classId: string }, ShareInfoRes> = async (req, res) => {
  const classId = idParam(req.params.classId);
  const cls = classOf(await assertCanAccessClass(staffAuth(req), classId));
  const db = getDb();
  const school = (await db.get<{ name: string; student_code: string }>('SELECT name, student_code FROM schools WHERE id = ?', [cls.schoolId]))!;
  const base = baseUrl(req);
  const joinUrl = `${base}${joinPath(cls.classCode)}`;
  res.json({
    joinUrl, schoolJoinUrl: `${base}${schoolJoinPath(school.student_code)}`, classCode: cls.classCode,
    whatsappText: classJoinText({ schoolName: school.name, className: cls.name, url: joinUrl }),
  });
};

const listStudents: H<{ classId: string }, RosterRes> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(staffAuth(req), classId);
  const rows = await getDb().all('SELECT * FROM students WHERE class_id = ? ORDER BY roll_no', [classId]);
  res.json(rows.map(rosterStudentOf));
};

const addStudents: H<{ classId: string }, RosterRes, AddStudentsReq> = async (req, res) => {
  const a = staffAuth(req);
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(a, classId);
  const b = asObject(req.body);
  if (!Array.isArray(b.students) || b.students.length < 1 || b.students.length > MAX_STUDENTS_PER_REQUEST) {
    throw badRequest(`students must be a list of 1-${MAX_STUDENTS_PER_REQUEST} entries`);
  }
  if (b.consentConfirmed !== undefined && typeof b.consentConfirmed !== 'boolean') throw badRequest('consentConfirmed must be true or false');
  const parsed = (b.students as unknown[]).map((s, i) => {
    const o = asObject(s);
    try {
      return { rollNo: reqInt(o, 'rollNo', 1, 9999), firstName: firstWord(reqString(o, 'firstName', 1, 30)) };
    } catch (e) {
      throw badRequest(`students[${i}]: ${(e as Error).message}`);
    }
  });
  const seen = new Set<number>();
  for (const s of parsed) {
    if (seen.has(s.rollNo)) throw new HttpError(409, 'conflict', `Roll number ${s.rollNo} appears twice`);
    seen.add(s.rollNo);
  }
  let created: RosterStudent[];
  try {
    created = await getDb().tx(async (q) => {
      const out: RosterStudent[] = [];
      for (const s of parsed) {
        if (await q.get('SELECT 1 FROM students WHERE class_id = ? AND roll_no = ?', [classId, s.rollNo])) {
          throw new HttpError(409, 'conflict', `Roll number ${s.rollNo} already exists in this class`);
        }
        const ins = await q.run(
          'INSERT INTO students (class_id, roll_no, first_name, avatar, pin) VALUES (?, ?, ?, ?, ?) RETURNING *',
          [classId, s.rollNo, s.firstName, avatarFor(s.rollNo), generatePin()],
        );
        out.push(rosterStudentOf(ins.rows[0]!));
      }
      if (b.consentConfirmed === true) {
        await q.run('UPDATE classes SET consent_attested_at = ?, consent_attested_by = ? WHERE id = ? AND consent_attested_at IS NULL', [
          new Date().toISOString(), a.teacherId, classId,
        ]);
      }
      await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'students.add', targetType: 'class', targetId: classId, meta: { count: out.length } });
      return out;
    });
  } catch (e) {
    // A concurrent request inserted the same roll number between our check and insert (UNIQUE(class_id, roll_no)).
    if (isUniqueViolation(e)) throw new HttpError(409, 'conflict', 'One of those roll numbers already exists in this class');
    throw e;
  }
  res.status(201).json(created);
};

const updateStudent: H<{ studentId: string }, RosterStudent, UpdateStudentReq> = async (req, res) => {
  const a = staffAuth(req);
  const studentId = idParam(req.params.studentId);
  const cur = await assertCanAccessStudent(a, studentId);
  const b = asObject(req.body);
  const rawName = optString(b, 'firstName', 1, 30);
  const firstName = rawName === undefined ? undefined : firstWord(rawName);
  const rollNo = optInt(b, 'rollNo', 1, 9999);
  const avatar = optString(b, 'avatar', 1, 16);
  if (b.active !== undefined && typeof b.active !== 'boolean') throw badRequest('active must be true or false');
  const active = b.active === undefined ? null : b.active ? 1 : 0;
  const db = getDb();
  try {
    await db.tx(async (q) => {
      await q.run(
        `UPDATE students SET first_name = COALESCE(?, first_name), roll_no = COALESCE(?, roll_no),
                avatar = COALESCE(?, avatar), active = COALESCE(?, active) WHERE id = ?`,
        [firstName ?? null, rollNo ?? null, avatar ?? null, active, studentId],
      );
      if (active === 0 && cur.active === 1) {
        await q.run('DELETE FROM auth_tokens WHERE student_id = ?', [studentId]);
        await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'student.deactivate', targetType: 'student', targetId: studentId });
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, 'conflict', 'That roll number is already used in this class');
    throw e;
  }
  res.json(rosterStudentOf((await db.get('SELECT * FROM students WHERE id = ?', [studentId]))!));
};

const resetPin: H<{ studentId: string }, RosterStudent, ResetPinReq> = async (req, res) => {
  const a = staffAuth(req);
  const studentId = idParam(req.params.studentId);
  await assertCanAccessStudent(a, studentId);
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
  if (b.signOutDevices !== undefined && typeof b.signOutDevices !== 'boolean') throw badRequest('signOutDevices must be true or false');
  const signOut = b.signOutDevices !== false;
  const db = getDb();
  await db.tx(async (q) => {
    await q.run('UPDATE students SET pin = ?, failed_pin_count = 0, locked_until = NULL WHERE id = ?', [generatePin(), studentId]);
    if (signOut) await q.run('DELETE FROM auth_tokens WHERE student_id = ?', [studentId]);
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'student.pin_reset', targetType: 'student', targetId: studentId, meta: { signOutDevices: signOut } });
  });
  res.json(rosterStudentOf((await db.get('SELECT * FROM students WHERE id = ?', [studentId]))!));
};

classesRouter.get('/teacher/overview', teacherOverview);
classesRouter.get('/classes', listClasses);
classesRouter.post('/classes', createClass);
classesRouter.patch('/classes/:classId', updateClass);
classesRouter.post('/classes/:classId/rotate-code', rotateCode);
classesRouter.get('/classes/:classId/share', shareInfo);
classesRouter.get('/classes/:classId/students', listStudents);
classesRouter.post('/classes/:classId/students', addStudents);
classesRouter.patch('/students/:studentId', updateStudent);
classesRouter.post('/students/:studentId/reset-pin', resetPin);
