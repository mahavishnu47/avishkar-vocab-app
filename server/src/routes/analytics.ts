/**
 * Teacher dashboard, leaderboard, analytics, CSV export. OWNER: Lane A. Contract: docs/API.md section 5-6.
 */
import { Router } from 'express';
import type { ClassAnalyticsRes, ClassDashboardRes, LeaderboardRes, StudentDetailRes } from '@shabd/core';
import { requireTeacher } from '../auth.ts';
import { notImplemented, type H } from '../http.ts';

export const analyticsRouter = Router();

const dashboard: H<{ classId: string }, ClassDashboardRes, unknown, { date?: string }> = notImplemented('GET /api/classes/:classId/dashboard');
const classLeaderboard: H<{ classId: string }, LeaderboardRes, unknown, { period?: 'week' | 'all' }> = notImplemented('GET /api/classes/:classId/leaderboard');
const classAnalytics: H<{ classId: string }, ClassAnalyticsRes, unknown, { from?: string; to?: string }> = notImplemented('GET /api/classes/:classId/analytics');
const studentAnalytics: H<{ studentId: string }, StudentDetailRes> = notImplemented('GET /api/students/:studentId/analytics');
const exportCsv: H<{ classId: string }, string, unknown, { type?: string }> = notImplemented('GET /api/classes/:classId/export.csv');

analyticsRouter.get('/classes/:classId/dashboard', requireTeacher, dashboard);
analyticsRouter.get('/classes/:classId/leaderboard', requireTeacher, classLeaderboard);
analyticsRouter.get('/classes/:classId/analytics', requireTeacher, classAnalytics);
analyticsRouter.get('/students/:studentId/analytics', requireTeacher, studentAnalytics);
analyticsRouter.get('/classes/:classId/export.csv', requireTeacher, exportCsv);
