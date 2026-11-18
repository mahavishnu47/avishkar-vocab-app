/**
 * Teacher dashboard, leaderboard, analytics, CSV export. OWNER: Lane A. Contract: docs/API.md section 5-6.
 */
import { Router } from 'express';
import type { ClassAnalyticsRes, ClassDashboardRes, LeaderboardRes, StudentDetailRes } from '@shabd/core';
import { assertTeacherOwnsClass, assertTeacherOwnsStudent, requireTeacher } from '../auth.ts';
import { today } from '../clock.ts';
import { getDb } from '../db/db.ts';
import { badRequest, type H } from '../http.ts';
import { classAnalytics as buildClassAnalytics, classDashboard, defaultWindow, exportCsv as buildCsv, leaderboard, studentDetail } from '../services/analytics.ts';
import { idParam, optDate } from '../validate.ts';

export const analyticsRouter = Router();

const tid = (req: { auth?: { role: string; teacherId?: number } }) => req.auth!.teacherId!;

const dashboard: H<{ classId: string }, ClassDashboardRes, unknown, { date?: string }> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass(tid(req), classId);
  res.json(await classDashboard(getDb(), classId, optDate(req.query.date, 'date') ?? today()));
};

const classLeaderboard: H<{ classId: string }, LeaderboardRes, unknown, { period?: 'week' | 'all' }> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass(tid(req), classId);
  const period = req.query.period ?? 'week';
  if (period !== 'week' && period !== 'all') throw badRequest("period must be 'week' or 'all'");
  res.json(await leaderboard(getDb(), classId, period, today()));
};

const classAnalytics: H<{ classId: string }, ClassAnalyticsRes, unknown, { from?: string; to?: string }> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass(tid(req), classId);
  const def = defaultWindow(today());
  const to = optDate(req.query.to, 'to') ?? def.to;
  const from = optDate(req.query.from, 'from') ?? defaultWindow(to).from;
  if (from > to) throw badRequest('from must not be after to');
  res.json(await buildClassAnalytics(getDb(), classId, from, to));
};

const studentAnalytics: H<{ studentId: string }, StudentDetailRes> = async (req, res) => {
  const studentId = idParam(req.params.studentId);
  await assertTeacherOwnsStudent(tid(req), studentId);
  res.json(await studentDetail(getDb(), studentId));
};

const TYPES = ['attempts', 'sentences', 'daily', 'students'] as const;
const exportCsv: H<{ classId: string }, string, unknown, { type?: string }> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass(tid(req), classId);
  const type = req.query.type as (typeof TYPES)[number] | undefined;
  if (!type || !TYPES.includes(type)) throw badRequest(`type must be one of ${TYPES.join(', ')}`);
  const db = getDb();
  const name = (await db.get<{ name: string }>('SELECT name FROM classes WHERE id = ?', [classId]))!.name;
  const safe = name.replace(/[^A-Za-z0-9_-]+/g, '_') || 'class';
  res
    .status(200)
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="${safe}-${type}-${today()}.csv"`)
    .send(await buildCsv(db, classId, type));
};

analyticsRouter.get('/classes/:classId/dashboard', requireTeacher, dashboard);
analyticsRouter.get('/classes/:classId/leaderboard', requireTeacher, classLeaderboard);
analyticsRouter.get('/classes/:classId/analytics', requireTeacher, classAnalytics);
analyticsRouter.get('/students/:studentId/analytics', requireTeacher, studentAnalytics);
analyticsRouter.get('/classes/:classId/export.csv', requireTeacher, exportCsv);
