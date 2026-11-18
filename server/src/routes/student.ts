/**
 * Student flow. OWNER: Lane A. Contract: docs/API.md section 7.
 */
import { Router } from 'express';
import type {
  AttemptsReq, AttemptsRes, CompleteWordRes, LeaderboardRes, SentenceReq, SentenceRes, SessionSummaryRes,
  StudentHomeRes, TodaySessionRes,
} from '@shabd/core';
import { requireStudent } from '../auth.ts';
import { notImplemented, type H } from '../http.ts';

export const studentRouter = Router();
studentRouter.use('/student', requireStudent);

const home: H<{}, StudentHomeRes> = notImplemented('GET /api/student/home');
const startToday: H<{}, TodaySessionRes> = notImplemented('POST /api/student/sessions/today');
const attempts: H<{ sessionId: string }, AttemptsRes, AttemptsReq> = notImplemented('POST /api/student/sessions/:sessionId/attempts');
const sentence: H<{ sessionId: string }, SentenceRes, SentenceReq> = notImplemented('POST /api/student/sessions/:sessionId/sentences');
const completeWord: H<{ sessionId: string; wordId: string }, CompleteWordRes> = notImplemented('POST /api/student/sessions/:sessionId/words/:wordId/complete');
const completeSession: H<{ sessionId: string }, SessionSummaryRes> = notImplemented('POST /api/student/sessions/:sessionId/complete');
const leaderboard: H<{}, LeaderboardRes> = notImplemented('GET /api/student/leaderboard');

studentRouter.get('/student/home', home);
studentRouter.post('/student/sessions/today', startToday);
studentRouter.post('/student/sessions/:sessionId/attempts', attempts);
studentRouter.post('/student/sessions/:sessionId/sentences', sentence);
studentRouter.post('/student/sessions/:sessionId/words/:wordId/complete', completeWord);
studentRouter.post('/student/sessions/:sessionId/complete', completeSession);
studentRouter.get('/student/leaderboard', leaderboard);
