/**
 * Public join endpoints for students (class link and school link). Contract: docs/ONBOARDING_SPEC.md 4.4.
 * Only first name, avatar and roll number are returned; no PIN, no surname, no contact data.
 */
import { Router } from 'express';
import type { JoinClassRes, JoinSchoolRes } from '@shabd/core';
import { getDb } from '../db/db.ts';
import { notFound, type H } from '../http.ts';
import { findJoinableClass } from '../services/join.ts';
import { clientKey, hit } from '../services/rateLimit.ts';

export const joinRouter = Router();

const joinClass: H<{ classCode: string }, JoinClassRes> = async (req, res) => {
  await hit('join', clientKey(req));
  const db = getDb();
  const cls = await findJoinableClass(db, req.params.classCode);
  if (!cls) throw notFound('Class not found');
  const school = await db.get<{ name: string }>('SELECT name FROM schools WHERE id = ?', [cls.school_id]);
  const students = await db.all<{ id: number; first_name: string; avatar: string; roll_no: number }>(
    'SELECT id, first_name, avatar, roll_no FROM students WHERE class_id = ? AND active = 1 ORDER BY lower(first_name), roll_no',
    [cls.id],
  );
  res.json({
    schoolName: school?.name ?? '',
    classRoom: { name: cls.name as string, classCode: cls.class_code as string },
    students: students.map((s) => ({ id: s.id, firstName: s.first_name, avatar: s.avatar, rollNo: s.roll_no })),
  });
};

const joinSchool: H<{ studentCode: string }, JoinSchoolRes> = async (req, res) => {
  await hit('join', clientKey(req));
  const db = getDb();
  const school = await db.get<{ id: number; name: string }>(
    "SELECT id, name FROM schools WHERE student_code = ? AND status = 'active'",
    [req.params.studentCode.trim().toUpperCase()],
  );
  if (!school) throw notFound('School not found');
  const classes = await db.all<{ name: string; class_code: string; standard: number; division: string }>(
    'SELECT name, class_code, standard, division FROM classes WHERE school_id = ? AND archived = 0 AND join_enabled = 1 ORDER BY standard, division, id',
    [school.id],
  );
  res.json({
    schoolName: school.name,
    classes: classes.map((c) => ({ name: c.name, classCode: c.class_code, standard: c.standard, division: c.division })),
  });
};

joinRouter.get('/join/class/:classCode', joinClass);
joinRouter.get('/join/school/:studentCode', joinSchool);
