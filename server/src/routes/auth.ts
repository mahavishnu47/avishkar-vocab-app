/**
 * Auth routes. OWNER: Lane A. Contract: docs/API.md section 2.
 */
import { Router } from 'express';
import type {
  MeRes, PublicRosterRes, StudentAuthRes, StudentLoginReq, TeacherAuthRes, TeacherLoginReq, TeacherRegisterReq,
} from '@shabd/core';
import { notImplemented, type H } from '../http.ts';

export const authRouter = Router();

const teacherRegister: H<{}, TeacherAuthRes, TeacherRegisterReq> = notImplemented('POST /api/auth/teacher/register');
const teacherLogin: H<{}, TeacherAuthRes, TeacherLoginReq> = notImplemented('POST /api/auth/teacher/login');
const publicRoster: H<{ classCode: string }, PublicRosterRes> = notImplemented('GET /api/auth/classes/:classCode/roster');
const studentLogin: H<{}, StudentAuthRes, StudentLoginReq> = notImplemented('POST /api/auth/student/login');
const me: H<{}, MeRes> = notImplemented('GET /api/auth/me');
const logout: H<{}, void> = notImplemented('POST /api/auth/logout');

authRouter.post('/auth/teacher/register', teacherRegister);
authRouter.post('/auth/teacher/login', teacherLogin);
authRouter.get('/auth/classes/:classCode/roster', publicRoster);
authRouter.post('/auth/student/login', studentLogin);
authRouter.get('/auth/me', me);
authRouter.post('/auth/logout', logout);
