/**
 * Classes & roster (teacher). OWNER: Lane A. Contract: docs/API.md section 3.
 */
import { Router } from 'express';
import type {
  AddStudentsReq, ClassRoom, CreateClassReq, RosterRes, StudentWithPin, UpdateClassReq, UpdateStudentReq,
} from '@shabd/core';
import { requireTeacher } from '../auth.ts';
import { notImplemented, type H } from '../http.ts';

export const classesRouter = Router();
classesRouter.use(['/classes', '/students'], requireTeacher);

const listClasses: H<{}, ClassRoom[]> = notImplemented('GET /api/classes');
const createClass: H<{}, ClassRoom, CreateClassReq> = notImplemented('POST /api/classes');
const updateClass: H<{ classId: string }, ClassRoom, UpdateClassReq> = notImplemented('PATCH /api/classes/:classId');
const listStudents: H<{ classId: string }, RosterRes> = notImplemented('GET /api/classes/:classId/students');
const addStudents: H<{ classId: string }, RosterRes, AddStudentsReq> = notImplemented('POST /api/classes/:classId/students');
const updateStudent: H<{ studentId: string }, StudentWithPin, UpdateStudentReq> = notImplemented('PATCH /api/students/:studentId');
const resetPin: H<{ studentId: string }, StudentWithPin> = notImplemented('POST /api/students/:studentId/reset-pin');

classesRouter.get('/classes', listClasses);
classesRouter.post('/classes', createClass);
classesRouter.patch('/classes/:classId', updateClass);
classesRouter.get('/classes/:classId/students', listStudents);
classesRouter.post('/classes/:classId/students', addStudents);
classesRouter.patch('/students/:studentId', updateStudent);
classesRouter.post('/students/:studentId/reset-pin', resetPin);
