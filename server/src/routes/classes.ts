/**
 * Classes & roster (teacher). OWNER: Lane A. Contract: docs/API.md section 3.
 */
import { Router } from 'express';
import type {
  AddStudentsReq, ClassRoom, CreateClassReq, RosterRes, RosterStudent, StudentWithPin, UpdateClassReq, UpdateStudentReq,
} from '@shabd/core';
import { assertTeacherOwnsClass, assertTeacherOwnsStudent, avatarFor, generateClassCode, generatePin, requireTeacher } from '../auth.ts';
import { today } from '../clock.ts';
import { getDb, isUniqueViolation } from '../db/db.ts';
import { academicYearFor, className as makeClassName } from '@shabd/core';
import { HttpError, badRequest, type H } from '../http.ts';
import { classOf, getClassRow, rosterStudentOf, studentWithPinOf } from '../mappers.ts';
import { asObject, idParam, optDate, optInt, optString, reqDate, reqInt, reqString } from '../validate.ts';

export const classesRouter = Router();
classesRouter.use(['/classes', '/students'], requireTeacher);

const MAX_STUDENTS_PER_REQUEST = 60;

const listClasses: H<{}, ClassRoom[]> = async (req, res) => {
  const rows = await getDb().all('SELECT * FROM classes WHERE teacher_id = ? ORDER BY id DESC', [(req.auth as { teacherId: number }).teacherId]);
  res.json(rows.map(classOf));
};

const createClass: H<{}, ClassRoom, CreateClassReq> = async (req, res) => {
  const b = asObject(req.body);
  // O1 minimal shim; O2 owns the full wizard rules (409 on duplicates, etc.).
  let standard = optInt(b, 'standard', 1, 12);
  let division = (optString(b, 'division', 0, 3) ?? '').toUpperCase();
  let name = optString(b, 'name', 1, 40);
  if (standard === undefined) {
    if (name === undefined) throw badRequest('standard or name is required');
    const m = /^([0-9]{1,2})\s*-?\s*([A-Za-z]?)$/.exec(name.trim());
    standard = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? Number(m[1]) : 5;
    division = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? m[2]!.toUpperCase() : '';
  }
  name ??= makeClassName(standard, division);
  const startDate = optDate(b.startDate, 'startDate') ?? today();
  const teacherId = (req.auth as { teacherId: number }).teacherId;
  const db = getDb();
  const schoolId = (await db.get<{ school_id: number }>('SELECT school_id FROM teachers WHERE id = ?', [teacherId]))!.school_id;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      // Not inside a transaction: a unique clash on class_code just retries with a new code.
      const ins = await db.run(
        'INSERT INTO classes (teacher_id, school_id, name, class_code, start_date, standard, division, academic_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        [teacherId, schoolId, name, generateClassCode(), startDate, standard, division, academicYearFor(startDate)],
      );
      res.status(201).json(classOf(await getClassRow(db, Number(ins.rows[0]!.id))));
      return;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new HttpError(500, 'internal', 'Could not generate a class code');
};

const updateClass: H<{ classId: string }, ClassRoom, UpdateClassReq> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass((req.auth as { teacherId: number }).teacherId, classId);
  const b = asObject(req.body);
  const name = optString(b, 'name', 1, 40);
  const startDate = b.startDate === undefined ? undefined : reqDate(b.startDate, 'startDate');
  const mode = b.leaderboardMode;
  if (mode !== undefined && mode !== 'individual' && mode !== 'hidden') throw badRequest("leaderboardMode must be 'individual' or 'hidden'");
  const db = getDb();
  await db.run(
    `UPDATE classes SET name = COALESCE(?, name), start_date = COALESCE(?, start_date),
            leaderboard_mode = COALESCE(?, leaderboard_mode) WHERE id = ?`,
    [name ?? null, startDate ?? null, mode ?? null, classId],
  );
  res.json(classOf(await getClassRow(db, classId)));
};

const listStudents: H<{ classId: string }, RosterRes> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass((req.auth as { teacherId: number }).teacherId, classId);
  const rows = await getDb().all('SELECT * FROM students WHERE class_id = ? ORDER BY roll_no', [classId]);
  res.json(rows.map(rosterStudentOf));
};

const addStudents: H<{ classId: string }, RosterRes, AddStudentsReq> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass((req.auth as { teacherId: number }).teacherId, classId);
  const b = asObject(req.body);
  if (!Array.isArray(b.students) || b.students.length < 1 || b.students.length > MAX_STUDENTS_PER_REQUEST) {
    throw badRequest(`students must be a list of 1-${MAX_STUDENTS_PER_REQUEST} entries`);
  }
  const parsed = (b.students as unknown[]).map((s, i) => {
    const o = asObject(s);
    try {
      return { rollNo: reqInt(o, 'rollNo', 1, 9999), firstName: reqString(o, 'firstName', 1, 30) };
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
      return out;
    });
  } catch (e) {
    // A concurrent request inserted the same roll number between our check and insert (UNIQUE(class_id, roll_no)).
    if (isUniqueViolation(e)) throw new HttpError(409, 'conflict', 'One of those roll numbers already exists in this class');
    throw e;
  }
  res.status(201).json(created);
};

const updateStudent: H<{ studentId: string }, StudentWithPin, UpdateStudentReq> = async (req, res) => {
  const studentId = idParam(req.params.studentId);
  await assertTeacherOwnsStudent((req.auth as { teacherId: number }).teacherId, studentId);
  const b = asObject(req.body);
  const firstName = optString(b, 'firstName', 1, 30);
  const rollNo = optInt(b, 'rollNo', 1, 9999);
  const avatar = optString(b, 'avatar', 1, 16);
  if (b.active !== undefined && typeof b.active !== 'boolean') throw badRequest('active must be true or false');
  const active = b.active === undefined ? null : b.active ? 1 : 0;
  const db = getDb();
  try {
    await db.run(
      `UPDATE students SET first_name = COALESCE(?, first_name), roll_no = COALESCE(?, roll_no),
              avatar = COALESCE(?, avatar), active = COALESCE(?, active) WHERE id = ?`,
      [firstName ?? null, rollNo ?? null, avatar ?? null, active, studentId],
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, 'conflict', 'That roll number is already used in this class');
    throw e;
  }
  res.json(studentWithPinOf((await db.get('SELECT * FROM students WHERE id = ?', [studentId]))!));
};

const resetPin: H<{ studentId: string }, StudentWithPin> = async (req, res) => {
  const studentId = idParam(req.params.studentId);
  await assertTeacherOwnsStudent((req.auth as { teacherId: number }).teacherId, studentId);
  const db = getDb();
  await db.run('UPDATE students SET pin = ?, failed_pin_count = 0, locked_until = NULL WHERE id = ?', [generatePin(), studentId]);
  res.json(studentWithPinOf((await db.get('SELECT * FROM students WHERE id = ?', [studentId]))!));
};

classesRouter.get('/classes', listClasses);
classesRouter.post('/classes', createClass);
classesRouter.patch('/classes/:classId', updateClass);
classesRouter.get('/classes/:classId/students', listStudents);
classesRouter.post('/classes/:classId/students', addStudents);
classesRouter.patch('/students/:studentId', updateStudent);
classesRouter.post('/students/:studentId/reset-pin', resetPin);
