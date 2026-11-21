/**
 * F9 endpoints: observation checklist and feedback questionnaire.
 * Staff routes: requireTeacher + study visibility (404 outside the school/class). Student routes: requireStudent, only
 * analysable participants (consent given, not excluded) of a study; 404 otherwise. Middleware is per route.
 */
import { Router } from 'express';
import type {
  FeedbackAnswerWrite, FeedbackRes, FeedbackWindow, ObservationKey, ObservationsRes, StudentFeedbackRes, StudyParticipant,
} from '@shabd/core';
import { FEEDBACK_ANSWERS, FEEDBACK_ITEMS, FEEDBACK_ITEM_COUNT, OBSERVATION_KEYS, OBSERVATION_MAX_WEEK } from '@shabd/core';
import { requireStudent, requireTeacher } from '../../auth.ts';
import { today } from '../../clock.ts';
import { getDb } from '../../db/db.ts';
import { HttpError, badRequest, notFound, type H } from '../../http.ts';
import { audit } from '../../services/audit.ts';
import {
  feedbackRows, feedbackWindow, getObservations, instrumentSummary, putFeedback, putObservation, setFeedbackWindow, studentAnswers,
} from '../../services/research/instruments.ts';
import { assertStudyVisible, getParticipantForStudent, listParticipants } from '../../services/research/study.ts';
import { staffAuth } from '../../tenancy.ts';
import { asObject, idParam, optDate } from '../../validate.ts';

export const instrumentsRouter = Router();

function weekOf(v: unknown): number {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > OBSERVATION_MAX_WEEK) throw badRequest(`week must be a whole number from 1 to ${OBSERVATION_MAX_WEEK}`);
  return n;
}

/** Participant of the study among the classes the caller may see, or 404. */
async function visiblePerson(req: Parameters<typeof staffAuth>[0], studyIdRaw: string | undefined, studentIdRaw: string | number | undefined) {
  const a = staffAuth(req);
  const studyId = idParam(studyIdRaw);
  const people = await listParticipants(a, studyId);
  if (studentIdRaw === undefined) return { a, studyId, people, person: undefined as StudyParticipant | undefined };
  const studentId = typeof studentIdRaw === 'number' ? studentIdRaw : idParam(studentIdRaw);
  const person = people.find((p) => p.studentId === studentId);
  if (!person) throw notFound('Student not found in this study');
  return { a, studyId, people, person };
}

function parseAnswers(v: unknown, requireAll: boolean): FeedbackAnswerWrite[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > FEEDBACK_ITEM_COUNT) throw badRequest('answers must be a list of item answers');
  const seen = new Set<number>();
  const out = v.map((x) => {
    const o = asObject(x);
    const itemNo = o.itemNo;
    if (typeof itemNo !== 'number' || !Number.isInteger(itemNo) || itemNo < 1 || itemNo > FEEDBACK_ITEM_COUNT) throw badRequest(`itemNo must be 1 to ${FEEDBACK_ITEM_COUNT}`);
    if (typeof o.answer !== 'string' || !(FEEDBACK_ANSWERS as readonly string[]).includes(o.answer)) throw badRequest('answer must be yes, some or no');
    if (seen.has(itemNo)) throw badRequest('Each item can only be answered once');
    seen.add(itemNo);
    return { itemNo, answer: o.answer } as FeedbackAnswerWrite;
  });
  if (requireAll && out.length !== FEEDBACK_ITEM_COUNT) throw badRequest(`Please answer all ${FEEDBACK_ITEM_COUNT} questions`);
  return out;
}

// ------------------------------------------------------------------ teacher: observations

const getObs: H<{ studyId: string }, ObservationsRes> = async (req, res) => {
  const { studyId, people } = await visiblePerson(req, req.params.studyId, undefined);
  const week = weekOf(req.query.week ?? '1');
  res.json({ studyId, week, rows: await getObservations(getDb(), studyId, week, people) });
};

const putObs: H<{ studyId: string }, { ok: true }> = async (req, res) => {
  const b = asObject(req.body);
  const studentId = b.studentId;
  if (typeof studentId !== 'number' || !Number.isInteger(studentId)) throw badRequest('studentId must be a number');
  const { a, studyId } = await visiblePerson(req, req.params.studyId, studentId);
  const week = weekOf(b.week ?? req.query.week);
  const vin = asObject(b.values);
  const values: Partial<Record<ObservationKey, boolean | null>> = {};
  for (const k of Object.keys(vin)) {
    if (!(OBSERVATION_KEYS as readonly string[]).includes(k)) throw badRequest(`Unknown indicator ${k}`);
    const v = vin[k];
    if (v !== null && typeof v !== 'boolean') throw badRequest(`${k} must be true, false or null`);
    values[k as ObservationKey] = v;
  }
  if (Object.keys(values).length === 0) throw badRequest('Nothing to change');
  const on = optDate(b.observedOn, 'observedOn') ?? today();
  await putObservation(getDb(), studyId, studentId, week, values, on, a.teacherId);
  res.json({ ok: true });
};

// ------------------------------------------------------------------ teacher: feedback

const getFb: H<{ studyId: string }, FeedbackRes> = async (req, res) => {
  const { studyId, people } = await visiblePerson(req, req.params.studyId, undefined);
  const db = getDb();
  const summary = await instrumentSummary(db, studyId);
  res.json({ studyId, ...(await feedbackWindow(db, studyId)), rows: await feedbackRows(db, studyId, people), summary: summary.feedback });
};

const patchWindow: H<{ studyId: string }, FeedbackWindow> = async (req, res) => {
  const a = staffAuth(req);
  const studyId = idParam(req.params.studyId);
  await assertStudyVisible(getDb(), a, studyId);
  const b = asObject(req.body);
  if (typeof b.open !== 'boolean') throw badRequest('open must be true or false');
  const w = await setFeedbackWindow(getDb(), studyId, b.open);
  await audit(getDb(), { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'feedback.window', meta: { studyId, open: b.open } });
  res.json(w);
};

const putPaper: H<{ studyId: string; studentId: string }, { ok: true }> = async (req, res) => {
  const { studyId, person } = await visiblePerson(req, req.params.studyId, req.params.studentId);
  const answers = parseAnswers(asObject(req.body).answers, false);
  await putFeedback(getDb(), studyId, person!.studentId, answers, 'paper');
  res.json({ ok: true });
};

// ------------------------------------------------------------------ student

async function studentStudy(req: Parameters<typeof staffAuth>[0]) {
  const s = req.auth;
  if (!s || s.role !== 'student') throw new HttpError(401, 'unauthorized', 'Please log in');
  const p = await getParticipantForStudent(getDb(), s.studentId);
  if (!p || !p.analysable) throw notFound('No questionnaire for you');
  return { studentId: s.studentId, studyId: p.studyId };
}

const stuGet: H<{}, StudentFeedbackRes> = async (req, res) => {
  const { studentId, studyId } = await studentStudy(req);
  const w = await feedbackWindow(getDb(), studyId);
  res.json({ open: w.open, items: FEEDBACK_ITEMS.map((i) => ({ itemNo: i.itemNo, text: i.text })), answers: await studentAnswers(getDb(), studyId, studentId) });
};

const stuPost: H<{}, { ok: true }> = async (req, res) => {
  const { studentId, studyId } = await studentStudy(req);
  if (!(await feedbackWindow(getDb(), studyId)).open) throw new HttpError(409, 'conflict', 'The questionnaire is not open');
  const answers = parseAnswers(asObject(req.body).answers, true);
  await putFeedback(getDb(), studyId, studentId, answers, 'app');
  res.json({ ok: true });
};

instrumentsRouter.get('/studies/:studyId/observations', requireTeacher, getObs);
instrumentsRouter.put('/studies/:studyId/observations', requireTeacher, putObs);
instrumentsRouter.get('/studies/:studyId/feedback', requireTeacher, getFb);
instrumentsRouter.patch('/studies/:studyId/feedback-window', requireTeacher, patchWindow);
instrumentsRouter.put('/studies/:studyId/feedback/:studentId', requireTeacher, putPaper);
instrumentsRouter.get('/student/feedback', requireStudent, stuGet);
instrumentsRouter.post('/student/feedback', requireStudent, stuPost);
