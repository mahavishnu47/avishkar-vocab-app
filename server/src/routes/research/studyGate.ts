/**
 * F2 gate, mounted before studentRouter: in a running study, starting today's session is refused (409 no_study_day)
 * for comparison classes and on non-study days. Classes outside a running study are untouched.
 */
import { Router } from 'express';
import { requireStudent } from '../../auth.ts';
import { today } from '../../clock.ts';
import { getDb } from '../../db/db.ts';
import { HttpError } from '../../http.ts';
import { classStudyDay } from '../../services/research/wordplan.ts';
import type { RequestHandler } from 'express';

export const studyGateRouter = Router();

const gate: RequestHandler = async (req, _res, next) => {
  try {
    const classId = (req.auth as { classId: number }).classId;
    const s = await classStudyDay(getDb(), classId, today());
    if (s && s.dayNo === null) throw new HttpError(409, 'conflict', 'no_study_day');
    next();
  } catch (e) {
    next(e);
  }
};

studyGateRouter.post('/student/sessions/today', requireStudent, gate);
