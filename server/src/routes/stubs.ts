/**
 * O1 contract stubs: every NEW onboarding endpoint (docs/ONBOARDING_SPEC.md section 4) answers 501 until
 * lane O2 replaces it with a real router. O2: delete a line here when you implement that endpoint, and
 * mount the real router before this one in app.ts.
 */
import { Router } from 'express';
import { notImplemented } from '../http.ts';

export const stubsRouter = Router();

const stub = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
  stubsRouter[method](path, notImplemented(`${method.toUpperCase()} /api${path}`));

// public + auth
stub('get', '/join/class/:classCode');
stub('get', '/join/school/:studentCode');
stub('get', '/invites/:code');
stub('post', '/auth/school/setup');
stub('post', '/auth/password-reset');

// teacher
stub('get', '/teacher/overview');
stub('post', '/classes/:classId/rotate-code');
stub('get', '/classes/:classId/share');

// school admin
stub('get', '/school');
stub('patch', '/school');
stub('post', '/school/rotate-student-code');
stub('get', '/school/overview');
stub('get', '/school/teachers');
stub('patch', '/school/teachers/:teacherId');
stub('post', '/school/teachers/:teacherId/reset-link');
stub('get', '/school/invites');
stub('post', '/school/invites');
stub('delete', '/school/invites/:inviteId');
stub('get', '/school/classes');
stub('patch', '/school/classes/:classId');
stub('get', '/school/audit');

// super admin
stub('get', '/admin/schools');
stub('post', '/admin/schools');
stub('post', '/admin/schools/:schoolId/setup-link');
stub('patch', '/admin/schools/:schoolId');
