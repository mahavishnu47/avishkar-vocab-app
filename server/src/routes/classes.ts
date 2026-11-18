/**
 * Classes & roster (teacher). OWNER: Lane A. Contract: docs/API.md section 3.
 */
import { Router } from 'express';
import type {
  AddStudentsReq, ClassRoom, CreateClassReq, RosterRes, StudentWithPin, UpdateClassReq, UpdateStudentReq,
} from '@shabd/core';
import { assertTeacherOwnsClass, assertTeacherOwnsStudent, avatarFor, generateClassCode, generatePin, requireTeacher } from '../auth.ts';
import { today } from '../clock.ts';
import { getDb } from '../db/db.ts';
import { HttpError, badRequest, type H } from '../http.ts';
import { classOf, getClassRow, studentWithPinOf } from '../mappers.ts';
import { asObject, idParam, optDate, optInt, optString, reqDate, reqInt, reqString } from '../validate.ts';

export const classesRouter = Router();
classesRouter.use(['/classes', '/students'], requireTeacher);

const MAX_STUDENTS_PER_REQUEST = 60;
const isUniqueError = (e: unknown) => (e as { code?: string })?.code?.startsWith('SQLITE_CONSTRAINT') ?? false;

const listClasses: H<{}, ClassRoom[]> = (req, res) => {
  const rows = getDb().prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY id DESC').all((req.auth as { teacherId: number }).teacherId);
  res.json((rows as Record<string, unknown>[]).map(classOf));
};

const createClass: H<{}, ClassRoom, CreateClassReq> = (req, res) => {
  const b = asObject(req.body);
  const name = reqString(b, 'name', 1, 40);
  const startDate = optDate(b.startDate, 'startDate') ?? today();
  const teacherId = (req.auth as { teacherId: number }).teacherId;
  const db = getDb();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const info = db
        .prepare('INSERT INTO classes (teacher_id, name, class_code, start_date) VALUES (?, ?, ?, ?)')
        .run(teacherId, name, generateClassCode(), startDate);
      res.status(201).json(classOf(getClassRow(db, Number(info.lastInsertRowid))));
      return;
    } catch (e) {
      if (!isUniqueError(e)) throw e;
    }
  }
  throw new HttpError(500, 'internal', 'Could not generate a class code');
};

const updateClass: H<{ classId: string }, ClassRoom, UpdateClassReq> = (req, res) => {
  const classId = idParam(req.params.classId);
  assertTeacherOwnsClass((req.auth as { teacherId: number }).teacherId, classId);
  const b = asObject(req.body);
  const name = optString(b, 'name', 1, 40);
  const startDate = b.startDate === undefined ? undefined : reqDate(b.startDate, 'startDate');
  const mode = b.leaderboardMode;
  if (mode !== undefined && mode !== 'individual' && mode !== 'hidden') throw badRequest("leaderboardMode must be 'individual' or 'hidden'");
  const db = getDb();
  db.prepare(
    `UPDATE classes SET name = COALESCE(?, name), start_date = COALESCE(?, start_date),
            leaderboard_mode = COALESCE(?, leaderboard_mode) WHERE id = ?`,
  ).run(name ?? null, startDate ?? null, mode ?? null, classId);
  res.json(classOf(getClassRow(db, classId)));
};

const listStudents: H<{ classId: string }, RosterRes> = (req, res) => {
  const classId = idParam(req.params.classId);
  assertTeacherOwnsClass((req.auth as { teacherId: number }).teacherId, classId);
  const rows = getDb().prepare('SELECT * FROM students WHERE class_id = ? ORDER BY roll_no').all(classId) as Record<string, unknown>[];
  res.json(rows.map(studentWithPinOf));
};

const addStudents: H<{ classId: string }, RosterRes, AddStudentsReq> = (req, res) => {
  const classId = idParam(req.params.classId);
  assertTeacherOwnsClass((req.auth as { teacherId: number }).teacherId, classId);
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
  const db = getDb();
  const created = db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM students WHERE class_id = ? AND roll_no = ?');
    const insert = db.prepare('INSERT INTO students (class_id, roll_no, first_name, avatar, pin) VALUES (?, ?, ?, ?, ?)');
    const get = db.prepare('SELECT * FROM students WHERE id = ?');
    const out: StudentWithPin[] = [];
    for (const s of parsed) {
      if (exists.get(classId, s.rollNo)) throw new HttpError(409, 'conflict', `Roll number ${s.rollNo} already exists in this class`);
      const info = insert.run(classId, s.rollNo, s.firstName, avatarFor(s.rollNo), generatePin());
      out.push(studentWithPinOf(get.get(Number(info.lastInsertRowid)) as Record<string, unknown>));
    }
    return out;
  })();
  res.status(201).json(created);
};

const updateStudent: H<{ studentId: string }, StudentWithPin, UpdateStudentReq> = (req, res) => {
  const studentId = idParam(req.params.studentId);
  assertTeacherOwnsStudent((req.auth as { teacherId: number }).teacherId, studentId);
  const b = asObject(req.body);
  const firstName = optString(b, 'firstName', 1, 30);
  const rollNo = optInt(b, 'rollNo', 1, 9999);
  const avatar = optString(b, 'avatar', 1, 16);
  if (b.active !== undefined && typeof b.active !== 'boolean') throw badRequest('active must be true or false');
  const active = b.active === undefined ? null : b.active ? 1 : 0;
  const db = getDb();
  try {
    db.prepare(
      `UPDATE students SET first_name = COALESCE(?, first_name), roll_no = COALESCE(?, roll_no),
              avatar = COALESCE(?, avatar), active = COALESCE(?, active) WHERE id = ?`,
    ).run(firstName ?? null, rollNo ?? null, avatar ?? null, active, studentId);
  } catch (e) {
    if (isUniqueError(e)) throw new HttpError(409, 'conflict', 'That roll number is already used in this class');
    throw e;
  }
  res.json(studentWithPinOf(db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as Record<string, unknown>));
};

const resetPin: H<{ studentId: string }, StudentWithPin> = (req, res) => {
  const studentId = idParam(req.params.studentId);
  assertTeacherOwnsStudent((req.auth as { teacherId: number }).teacherId, studentId);
  const db = getDb();
  db.prepare('UPDATE students SET pin = ?, failed_pin_count = 0, locked_until = NULL WHERE id = ?').run(generatePin(), studentId);
  res.json(studentWithPinOf(db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as Record<string, unknown>));
};

classesRouter.get('/classes', listClasses);
classesRouter.post('/classes', createClass);
classesRouter.patch('/classes/:classId', updateClass);
classesRouter.get('/classes/:classId/students', listStudents);
classesRouter.post('/classes/:classId/students', addStudents);
classesRouter.patch('/students/:studentId', updateStudent);
classesRouter.post('/students/:studentId/reset-pin', resetPin);
