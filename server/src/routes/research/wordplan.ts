/** F2 endpoints: the study word plan, holidays, and the student's study-day state. */
import { Router } from 'express';
import type { PutHolidaysReq, PutPlanDayReq, StudyDayRes, StudyPlanRes } from '@shabd/core';
import { requireStudent, requireTeacher } from '../../auth.ts';
import { today } from '../../clock.ts';
import { getDb } from '../../db/db.ts';
import { badRequest, type H } from '../../http.ts';
import { buildPlan, classStudyDay, setHolidays, setPlanDay } from '../../services/research/wordplan.ts';
import { staffAuth } from '../../tenancy.ts';
import { asObject, idParam, reqDate, stringArray } from '../../validate.ts';

export const wordPlanRouter = Router();

const getPlan: H<{ studyId: string }, StudyPlanRes> = async (req, res) => {
  res.json(await buildPlan(staffAuth(req), getDb(), idParam(req.params.studyId)));
};

const putDay: H<{ studyId: string; dayNo: string }, StudyPlanRes, PutPlanDayReq> = async (req, res) => {
  const a = staffAuth(req);
  const studyId = idParam(req.params.studyId);
  const dayNo = idParam(req.params.dayNo);
  const wordIds = stringArray(asObject(req.body).wordIds, 'wordIds', 5, 5, 40);
  await setPlanDay(a, getDb(), studyId, dayNo, wordIds);
  res.json(await buildPlan(a, getDb(), studyId));
};

const putHolidays: H<{ studyId: string }, StudyPlanRes, PutHolidaysReq> = async (req, res) => {
  const a = staffAuth(req);
  const studyId = idParam(req.params.studyId);
  const raw = asObject(req.body).dates;
  if (!Array.isArray(raw) || raw.length > 200) throw badRequest('dates must be a list of up to 200 dates');
  const dates = raw.map((d, i) => reqDate(d, `dates[${i}]`));
  await setHolidays(a, getDb(), studyId, dates);
  res.json(await buildPlan(a, getDb(), studyId));
};

const studyDay: H<{}, StudyDayRes> = async (req, res) => {
  const classId = (req.auth as { classId: number }).classId;
  const s = await classStudyDay(getDb(), classId, today());
  if (!s) { res.json({ inStudy: false, group: null, dayNo: null, totalDays: 0, reason: 'no_study' }); return; }
  res.json({ inStudy: s.reason === 'study_day', group: s.group, dayNo: s.dayNo, totalDays: s.schoolDays, reason: s.reason });
};

wordPlanRouter.get('/studies/:studyId/plan', requireTeacher, getPlan);
wordPlanRouter.put('/studies/:studyId/plan/:dayNo', requireTeacher, putDay);
wordPlanRouter.put('/studies/:studyId/holidays', requireTeacher, putHolidays);
wordPlanRouter.get('/student/study-day', requireStudent, studyDay);
