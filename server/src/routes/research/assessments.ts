/**
 * F4 assessment endpoints (teacher + student). Teacher routes: requireTeacher + assertCanAccessClass (404 outside the school).
 * Student routes: requireStudent, own class only. Answers never appear in student payloads.
 */
import { Router } from 'express';
import type {
  AssessmentFormId, AssessmentKind, AssessmentMode, AssessmentResultsRes, AssessmentWindowRes, PrintableForm, ResponseWrite,
  StartAssessmentRes, StudentAssessmentCurrentRes, StudentAssessmentRes, SubmitAssessmentRes, SaveResponsesRes,
} from '@shabd/core';
import { ASSESSMENT_ITEM_MAX, ASSESSMENT_POS_OPTIONS, ASSESSMENT_SECTION_MAX } from '@shabd/core';
import { requireStudent, requireTeacher } from '../../auth.ts';
import { getDb, isUniqueViolation } from '../../db/db.ts';
import { HttpError, badRequest, forbidden, notFound, type H } from '../../http.ts';
import { audit } from '../../services/audit.ts';
import {
  attemptStatus, finalizeExpired, findItem, generateAccessCode, getForm, getWindow, itemsForStudent, nowIso, printableForm,
  reviewItems, savedAnswers, statusOf, submitAttempt, windowResults, windowRes, type AttemptRow, type WindowRow,
} from '../../services/research/assessment.ts';
import { assertCanAccessClass, staffAuth } from '../../tenancy.ts';
import { asObject, idParam, optInt, reqInt, reqString } from '../../validate.ts';

export const assessmentsRouter = Router();

const conflict = (msg: string) => new HttpError(409, 'conflict', msg);
const isForm = (v: unknown): v is AssessmentFormId => v === 'A' || v === 'B';
const isMode = (v: unknown): v is AssessmentMode => v === 'app' || v === 'paper';

/** Teacher: the window must belong to a class the staff member can access, and to that class in the URL. */
async function teacherWindow(req: Parameters<typeof staffAuth>[0], classIdRaw: string | undefined, windowIdRaw: string | undefined): Promise<WindowRow> {
  const a = staffAuth(req);
  const classId = idParam(classIdRaw);
  await assertCanAccessClass(a, classId);
  const w = await getWindow(getDb(), idParam(windowIdRaw));
  if (!w || w.class_id !== classId) throw notFound('Test not found');
  return w;
}

async function rosterStudent(classId: number, studentId: number): Promise<{ id: number; roll_no: number; first_name: string }> {
  const s = await getDb().get<{ id: number; roll_no: number; first_name: string }>('SELECT id, roll_no, first_name FROM students WHERE id = ? AND class_id = ?', [studentId, classId]);
  if (!s) throw notFound('Student not found');
  return s;
}

// ------------------------------------------------------------------ teacher

const listWindows: H<{ classId: string }, AssessmentWindowRes[]> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(staffAuth(req), classId);
  const rows = await getDb().all<WindowRow>('SELECT * FROM assessment_windows WHERE class_id = ? ORDER BY kind DESC', [classId]);
  for (const w of rows) await finalizeExpired(getDb(), w.id);
  res.json(await Promise.all(rows.map((w) => windowRes(getDb(), w))));
};

const createWindow: H<{ classId: string }, AssessmentWindowRes> = async (req, res) => {
  const a = staffAuth(req);
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(a, classId);
  const o = asObject(req.body);
  if (o.kind !== 'pre' && o.kind !== 'post') throw badRequest('kind must be pre or post');
  const kind = o.kind as AssessmentKind;
  if (o.formId !== undefined && !isForm(o.formId)) throw badRequest('formId must be A or B');
  if (o.mode !== undefined && !isMode(o.mode)) throw badRequest('mode must be app or paper');
  const formId: AssessmentFormId = (o.formId as AssessmentFormId | undefined) ?? (kind === 'pre' ? 'A' : 'B');
  const mode: AssessmentMode = (o.mode as AssessmentMode | undefined) ?? 'app';
  const durationMin = optInt(o, 'durationMin', 5, 120) ?? 25;
  try {
    const r = await getDb().run(
      `INSERT INTO assessment_windows (class_id, kind, form_id, form_version, mode, duration_min, access_code, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [classId, kind, formId, getForm(formId).formVersion, mode, durationMin, generateAccessCode(), a.teacherId],
    );
    await audit(getDb(), { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'assessment.create', targetType: 'class', targetId: classId, meta: { windowId: r.rows[0]!.id as number, kind } });
    const w = (await getWindow(getDb(), r.rows[0]!.id as number))!;
    res.status(201).json(await windowRes(getDb(), w));
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`This class already has a ${kind}-test`);
    throw e;
  }
};

const patchWindow: H<{ classId: string; windowId: string }, AssessmentWindowRes> = async (req, res) => {
  const a = staffAuth(req);
  const w = await teacherWindow(req, req.params.classId, req.params.windowId);
  const o = asObject(req.body);
  const db = getDb();
  if (o.action === 'open') {
    if (w.opened_at) throw conflict('This test was already opened');
    await db.run('UPDATE assessment_windows SET opened_at = ? WHERE id = ?', [nowIso(), w.id]);
  } else if (o.action === 'close') {
    if (!w.opened_at) throw conflict('Open the test before closing it');
    if (!w.closed_at) {
      await db.run('UPDATE assessment_windows SET closed_at = ? WHERE id = ?', [nowIso(), w.id]);
      await finalizeExpired(db, w.id); // in-progress attempts are submitted and marked
    }
  } else if (o.action === 'reset_attempt') {
    const studentId = reqInt(o, 'studentId', 1);
    await rosterStudent(w.class_id, studentId);
    await db.run('DELETE FROM assessment_attempts WHERE window_id = ? AND student_id = ?', [w.id, studentId]);
    await audit(db, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'assessment.reset_attempt', targetType: 'student', targetId: studentId, meta: { windowId: w.id } });
  } else if (o.action === 'update') {
    if (statusOf(w) !== 'draft') throw conflict('You can only change a test before it is opened');
    if (o.formId !== undefined && !isForm(o.formId)) throw badRequest('formId must be A or B');
    if (o.mode !== undefined && !isMode(o.mode)) throw badRequest('mode must be app or paper');
    const formId = (o.formId as AssessmentFormId | undefined) ?? w.form_id;
    await db.run('UPDATE assessment_windows SET form_id = ?, form_version = ?, mode = ?, duration_min = ? WHERE id = ?', [
      formId, getForm(formId).formVersion, (o.mode as AssessmentMode | undefined) ?? w.mode, optInt(o, 'durationMin', 5, 120) ?? w.duration_min, w.id,
    ]);
  } else throw badRequest('action must be open, close, reset_attempt or update');
  res.json(await windowRes(db, (await getWindow(db, w.id))!));
};

const results: H<{ classId: string; windowId: string }, AssessmentResultsRes> = async (req, res) => {
  const w = await teacherWindow(req, req.params.classId, req.params.windowId);
  await finalizeExpired(getDb(), w.id);
  const fresh = (await getWindow(getDb(), w.id))!;
  res.json({ window: await windowRes(getDb(), fresh), rows: await windowResults(getDb(), fresh) });
};

const studentDetail: H<{ classId: string; windowId: string; studentId: string }, StudentAssessmentRes> = async (req, res) => {
  const w = await teacherWindow(req, req.params.classId, req.params.windowId);
  const st = await rosterStudent(w.class_id, idParam(req.params.studentId));
  await finalizeExpired(getDb(), w.id);
  const rows = await windowResults(getDb(), w);
  const row = rows.find((r) => r.studentId === st.id)!;
  const at = await getDb().get<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ? AND student_id = ?', [w.id, st.id]);
  const man = await getDb().get<{ section_a: number; section_b: number; section_c: number }>('SELECT * FROM assessment_manual_scores WHERE window_id = ? AND student_id = ?', [w.id, st.id]);
  res.json({
    windowId: w.id, studentId: st.id, rollNo: st.roll_no, firstName: st.first_name, status: row.status,
    items: at?.submitted_at ? await reviewItems(getDb(), w, at.id) : [],
    manual: man ? { a: man.section_a, b: man.section_b, c: man.section_c } : null,
    a: row.a, b: row.b, c: row.c, total: row.total,
  });
};

const overrideItem: H<{ classId: string; windowId: string; studentId: string; itemId: string }, { ok: true }> = async (req, res) => {
  const a = staffAuth(req);
  const w = await teacherWindow(req, req.params.classId, req.params.windowId);
  const st = await rosterStudent(w.class_id, idParam(req.params.studentId));
  const found = findItem(getForm(w.form_id), req.params.itemId);
  if (!found) throw notFound('Question not found');
  const o = asObject(req.body);
  let marks: number | null = null;
  if (o.overrideMarks !== null) marks = reqInt(o, 'overrideMarks', 0, ASSESSMENT_ITEM_MAX[found.section]);
  const at = await getDb().get<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ? AND student_id = ?', [w.id, st.id]);
  if (!at?.submitted_at) throw conflict('This child has not submitted yet');
  await getDb().run(
    'UPDATE assessment_responses SET override_marks = ?, overridden_by = ?, overridden_at = ? WHERE attempt_id = ? AND item_id = ?',
    [marks, marks === null ? null : a.teacherId, marks === null ? null : nowIso(), at.id, found.item.id],
  );
  await audit(getDb(), { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'assessment.override', targetType: 'student', targetId: st.id, meta: { windowId: w.id, itemId: found.item.id, marks } });
  res.json({ ok: true });
};

const putManual: H<{ classId: string; windowId: string; studentId: string }, { ok: true }> = async (req, res) => {
  const a = staffAuth(req);
  const w = await teacherWindow(req, req.params.classId, req.params.windowId);
  const st = await rosterStudent(w.class_id, idParam(req.params.studentId));
  const o = asObject(req.body);
  const [sa, sb, sc] = [reqInt(o, 'a', 0, ASSESSMENT_SECTION_MAX), reqInt(o, 'b', 0, ASSESSMENT_SECTION_MAX), reqInt(o, 'c', 0, ASSESSMENT_SECTION_MAX)];
  await getDb().run(
    `INSERT INTO assessment_manual_scores (window_id, student_id, section_a, section_b, section_c, entered_by, entered_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (window_id, student_id) DO UPDATE SET section_a = EXCLUDED.section_a, section_b = EXCLUDED.section_b, section_c = EXCLUDED.section_c, entered_by = EXCLUDED.entered_by, entered_at = EXCLUDED.entered_at`,
    [w.id, st.id, sa, sb, sc, a.teacherId, nowIso()],
  );
  await audit(getDb(), { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'assessment.manual', targetType: 'student', targetId: st.id, meta: { windowId: w.id } });
  res.json({ ok: true });
};

const printForm: H<{ formId: string }, PrintableForm> = (req, res) => {
  staffAuth(req);
  const id = req.params.formId?.toUpperCase();
  if (!isForm(id)) throw notFound('Form not found');
  res.json(printableForm(getForm(id)));
};

assessmentsRouter.get('/classes/:classId/assessments', requireTeacher, listWindows);
assessmentsRouter.post('/classes/:classId/assessments', requireTeacher, createWindow);
assessmentsRouter.patch('/classes/:classId/assessments/:windowId', requireTeacher, patchWindow);
assessmentsRouter.get('/classes/:classId/assessments/:windowId/results', requireTeacher, results);
assessmentsRouter.get('/classes/:classId/assessments/:windowId/students/:studentId', requireTeacher, studentDetail);
assessmentsRouter.patch('/classes/:classId/assessments/:windowId/students/:studentId/items/:itemId', requireTeacher, overrideItem);
assessmentsRouter.put('/classes/:classId/assessments/:windowId/students/:studentId/manual', requireTeacher, putManual);
assessmentsRouter.get('/assessment-forms/:formId/print', requireTeacher, printForm);

// ------------------------------------------------------------------ student

function studentAuth(req: Parameters<typeof staffAuth>[0]) {
  if (req.auth?.role !== 'student') throw new HttpError(401, 'unauthorized', 'Please log in');
  return req.auth;
}

/** The student's own window (class match), else 404. */
async function ownWindow(classId: number, windowIdRaw: string | undefined): Promise<WindowRow> {
  const w = await getWindow(getDb(), idParam(windowIdRaw));
  if (!w || w.class_id !== classId) throw notFound('Test not found');
  return w;
}

const current: H<{}, StudentAssessmentCurrentRes> = async (req, res) => {
  const a = studentAuth(req);
  const w = await getDb().get<WindowRow>(
    "SELECT * FROM assessment_windows WHERE class_id = ? AND mode = 'app' AND opened_at IS NOT NULL AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1", [a.classId]);
  const serverNow = nowIso();
  if (!w) { res.json({ assessment: null, serverNow }); return; }
  await finalizeExpired(getDb(), w.id);
  const at = await getDb().get<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ? AND student_id = ?', [w.id, a.studentId]);
  res.json({ assessment: { windowId: w.id, kind: w.kind, durationMin: w.duration_min, attempt: attemptStatus(at), deadlineAt: at?.deadline_at ?? null }, serverNow });
};

const start: H<{ windowId: string }, StartAssessmentRes> = async (req, res) => {
  const a = studentAuth(req);
  const w = await ownWindow(a.classId, req.params.windowId);
  if (w.mode !== 'app') throw conflict('This test is on paper');
  await finalizeExpired(getDb(), w.id);
  let at = await getDb().get<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ? AND student_id = ?', [w.id, a.studentId]);
  if (!at) {
    if (statusOf(w) !== 'open') throw conflict('This test is not open');
    const code = reqString(asObject(req.body), 'accessCode', 1, 20).toUpperCase().replace(/\s+/g, '');
    if (code !== w.access_code) throw forbidden('That code is not right. Ask your teacher.');
    const startedAt = new Date();
    const deadline = new Date(startedAt.getTime() + w.duration_min * 60_000);
    try {
      await getDb().run(
        'INSERT INTO assessment_attempts (window_id, student_id, started_at, deadline_at, order_seed) VALUES (?, ?, ?, ?, ?)',
        [w.id, a.studentId, startedAt.toISOString(), deadline.toISOString(), Math.floor(Math.random() * 2_000_000_000)],
      );
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // a double tap: fall through to the attempt that won
    }
    at = (await getDb().get<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ? AND student_id = ?', [w.id, a.studentId]))!;
  }
  const submitted = at.submitted_at !== null;
  const rows = submitted ? [] : await getDb().all('SELECT * FROM assessment_responses WHERE attempt_id = ?', [at.id]);
  res.json({
    windowId: w.id, kind: w.kind, attempt: attemptStatus(at), startedAt: at.started_at, deadlineAt: at.deadline_at, serverNow: nowIso(),
    items: submitted ? [] : itemsForStudent(getForm(w.form_id), at.order_seed), saved: savedAnswers(rows),
  });
};

async function ownAttempt(classId: number, studentId: number, windowIdRaw: string | undefined): Promise<{ w: WindowRow; at: AttemptRow }> {
  const w = await ownWindow(classId, windowIdRaw);
  await finalizeExpired(getDb(), w.id);
  const at = await getDb().get<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ? AND student_id = ?', [w.id, studentId]);
  if (!at) throw notFound('Start the test first');
  return { w, at };
}

const MAX_WRITES = 40;
const saveResponses: H<{ windowId: string }, SaveResponsesRes> = async (req, res) => {
  const a = studentAuth(req);
  const { w, at } = await ownAttempt(a.classId, a.studentId, req.params.windowId);
  if (at.submitted_at) throw conflict('You already finished this test');
  if (Date.now() > Date.parse(at.deadline_at) + 60_000) throw conflict('Time is up');
  const o = asObject(req.body);
  const items = o.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_WRITES) throw badRequest(`items must be a list of 1-${MAX_WRITES} answers`);
  const form = getForm(w.form_id);
  const writes: { itemId: string; section: string; answer: string; ms: number; keys: number; dels: number }[] = [];
  for (const raw of items as ResponseWrite[]) {
    const it = asObject(raw);
    const itemId = reqString(it, 'itemId', 1, 20);
    const found = findItem(form, itemId);
    if (!found) throw badRequest(`Unknown question ${itemId}`);
    if (typeof it.answer !== 'string' || it.answer.length > 400) throw badRequest('answer must be text of up to 400 characters');
    const answer = it.answer.trim();
    if (found.section === 'A' && answer !== '' && ![found.item.correct, ...found.item.distractors].includes(answer)) throw badRequest('That is not one of the choices');
    if (found.section === 'B' && answer !== '' && !(ASSESSMENT_POS_OPTIONS as readonly string[]).includes(answer.toLowerCase())) throw badRequest('That is not one of the choices');
    writes.push({
      itemId, section: found.section, answer: found.section === 'B' ? answer.toLowerCase() : answer,
      ms: optInt(it, 'msElapsed', 0, 3_600_000) ?? 0, keys: optInt(it, 'keystrokes', 0, 100_000) ?? 0, dels: optInt(it, 'deletions', 0, 100_000) ?? 0,
    });
  }
  const now = nowIso();
  await getDb().tx(async (t) => {
    for (const x of writes) {
      await t.run(
        `INSERT INTO assessment_responses (attempt_id, item_id, section, answer, ms_elapsed, keystrokes, deletions, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (attempt_id, item_id) DO UPDATE SET answer = EXCLUDED.answer, ms_elapsed = EXCLUDED.ms_elapsed, keystrokes = EXCLUDED.keystrokes,
           deletions = EXCLUDED.deletions, updated_at = EXCLUDED.updated_at`,
        [at.id, x.itemId, x.section, x.answer, x.ms, x.keys, x.dels, now],
      );
    }
  });
  res.json({ saved: writes.length, deadlineAt: at.deadline_at, serverNow: now });
};

const submit: H<{ windowId: string }, SubmitAssessmentRes> = async (req, res) => {
  const a = studentAuth(req);
  const { at } = await ownAttempt(a.classId, a.studentId, req.params.windowId);
  if (!at.submitted_at) {
    const late = Date.now() > Date.parse(at.deadline_at) + 60_000;
    await submitAttempt(getDb(), at, late ? at.deadline_at : nowIso());
  }
  res.json({ submitted: true });
};

assessmentsRouter.get('/student/assessments/current', requireStudent, current);
assessmentsRouter.post('/student/assessments/:windowId/start', requireStudent, start);
assessmentsRouter.put('/student/assessments/:windowId/responses', requireStudent, saveResponses);
assessmentsRouter.post('/student/assessments/:windowId/submit', requireStudent, submit);
