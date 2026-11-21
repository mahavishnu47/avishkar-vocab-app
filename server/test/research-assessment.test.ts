import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ClassRoom, StartAssessmentRes, StudentWithPin } from '@shabd/core';
import { auth, closeTestDb, makeClass, registerTeacher, setup, studentLogin } from './helpers.ts';
import type { DB } from '../src/db/db.ts';
import { assessmentScores, getForm } from '../src/services/research/assessment.ts';

let app: Express;
let db: DB;
let teacher: string;
let cls: ClassRoom;
let students: StudentWithPin[];
let tokens: string[];

const GOOD_C: Record<string, string> = {
  c1: 'The children sat on the chairs in the big hall.',
  c2: 'My mother wore a soft silk saree at the festival.',
  c3: 'The smoky kitchen made me cough.',
  c4: 'I felt sweaty after I ran in the hot sun.',
  c5: 'I kneel on the floor to pray.',
};

beforeEach(async () => {
  ({ app, db } = await setup());
  teacher = await registerTeacher(app);
  ({ cls, students } = await makeClass(app, teacher, ['Riya', 'Aarav', 'Kabir']));
  tokens = await Promise.all(students.map((s) => studentLogin(app, cls, s)));
});
afterAll(closeTestDb);

const base = () => `/api/classes/${cls.id}/assessments`;
async function createWin(body: Record<string, unknown> = { kind: 'pre' }) {
  const r = await request(app).post(base()).set(auth(teacher)).send(body);
  expect(r.status).toBe(201);
  return r.body as { id: number; accessCode: string; status: string };
}
async function openWin(id: number) {
  const r = await request(app).patch(`${base()}/${id}`).set(auth(teacher)).send({ action: 'open' });
  expect(r.status).toBe(200);
}
async function startAs(i: number, win: { id: number; accessCode: string }) {
  return request(app).post(`/api/student/assessments/${win.id}/start`).set(auth(tokens[i]!)).send({ accessCode: win.accessCode });
}
/** Answers for every item: A and B right (except `wrongA` first A items), C from GOOD_C. */
function answersFor(formId: 'A' | 'B', items: StartAssessmentRes['items'], opts: { wrongA?: number; c?: Record<string, string> } = {}) {
  const f = getForm(formId);
  let wrong = opts.wrongA ?? 0;
  return items.map((it) => {
    if (it.section === 'A') {
      const x = f.sectionA.find((i) => i.id === it.id)!;
      if (wrong > 0) { wrong--; return { itemId: it.id, answer: x.distractors[0]! }; }
      return { itemId: it.id, answer: x.correct };
    }
    if (it.section === 'B') return { itemId: it.id, answer: f.sectionB.find((i) => i.id === it.id)!.answer };
    return { itemId: it.id, answer: (opts.c ?? GOOD_C)[it.id] ?? '' };
  });
}
const put = (i: number, winId: number, items: unknown) => request(app).put(`/api/student/assessments/${winId}/responses`).set(auth(tokens[i]!)).send({ items });
const submit = (i: number, winId: number) => request(app).post(`/api/student/assessments/${winId}/submit`).set(auth(tokens[i]!)).send({});
const results = async (winId: number) => (await request(app).get(`${base()}/${winId}/results`).set(auth(teacher))).body;

describe('window lifecycle', () => {
  it('creates a draft with a 4-letter code, one window per kind, and opens/closes it', async () => {
    const w = await createWin();
    expect(w.accessCode).toMatch(/^[A-Z2-9]{4}$/);
    expect(w.status).toBe('draft');
    expect((await request(app).post(base()).set(auth(teacher)).send({ kind: 'pre' })).status).toBe(409);
    expect((await request(app).post(base()).set(auth(teacher)).send({ kind: 'later' })).status).toBe(400);
    expect((await request(app).patch(`${base()}/${w.id}`).set(auth(teacher)).send({ action: 'close' })).status).toBe(409); // not opened
    await openWin(w.id);
    const closed = await request(app).patch(`${base()}/${w.id}`).set(auth(teacher)).send({ action: 'close' });
    expect(closed.body.status).toBe('closed');
    const list = await request(app).get(base()).set(auth(teacher));
    expect(list.body).toHaveLength(1);
  });

  it('students cannot see or start a test until it is open, and only with the right code', async () => {
    const w = await createWin();
    const before = await request(app).get('/api/student/assessments/current').set(auth(tokens[0]!));
    expect(before.body.assessment).toBeNull();
    expect((await startAs(0, w)).status).toBe(409); // draft
    await openWin(w.id);
    const cur = await request(app).get('/api/student/assessments/current').set(auth(tokens[0]!));
    expect(cur.body.assessment).toMatchObject({ windowId: w.id, kind: 'pre', attempt: 'not_started' });
    expect(JSON.stringify(cur.body)).not.toContain(w.accessCode);
    const wrong = await request(app).post(`/api/student/assessments/${w.id}/start`).set(auth(tokens[0]!)).send({ accessCode: 'ZZZZ' });
    expect(wrong.status).toBe(403);
    expect((await request(app).post(`/api/student/assessments/${w.id}/start`).set(auth(tokens[0]!)).send({})).status).toBe(400);
    const lower = await request(app).post(`/api/student/assessments/${w.id}/start`).set(auth(tokens[0]!)).send({ accessCode: ` ${w.accessCode.toLowerCase()} ` });
    expect(lower.status).toBe(200);
  });

  it('a double start returns the same attempt (same deadline and same order); the order differs between students', async () => {
    const w = await createWin();
    await openWin(w.id);
    const s1 = (await startAs(0, w)).body as StartAssessmentRes;
    const s2 = (await startAs(0, w)).body as StartAssessmentRes;
    expect(s2.deadlineAt).toBe(s1.deadlineAt);
    expect(s2.items).toEqual(s1.items);
    expect(s1.items).toHaveLength(25);
    const other = (await startAs(1, w)).body as StartAssessmentRes;
    expect(other.items.map((i) => i.id)).not.toEqual(s1.items.map((i) => i.id));
    expect(await db.get('SELECT COUNT(*)::int AS n FROM assessment_attempts WHERE window_id = ?', [w.id])).toEqual({ n: 2 });
    // resuming does not need the code again
    const resume = await request(app).post(`/api/student/assessments/${w.id}/start`).set(auth(tokens[0]!)).send({});
    expect(resume.status).toBe(200);
  });

  it('student payloads never contain answers', async () => {
    const w = await createWin();
    await openWin(w.id);
    const started = await startAs(0, w);
    const f = getForm('A');
    const txt = JSON.stringify(started.body);
    expect(txt).not.toMatch(/"(correct|answer|distractors|pos|meaning|exampleSentence|contextWords)"/);
    for (const it of started.body.items) {
      if (it.section === 'A') expect(Object.keys(it).sort()).toEqual(['id', 'options', 'section', 'word']);
      if (it.section === 'C') expect(Object.keys(it).sort()).toEqual(['id', 'section', 'word']);
    }
    expect(txt).not.toContain(f.sectionC[0]!.exampleSentence);
    const saved = await put(0, w.id, [{ itemId: 'c1', answer: 'The hall is big.' }]);
    expect(JSON.stringify(saved.body)).not.toMatch(/marks/i);
    const sub = await submit(0, w.id);
    expect(JSON.stringify(sub.body)).toBe('{"submitted":true}');
    const cur = await request(app).get('/api/student/assessments/current').set(auth(tokens[0]!));
    expect(cur.body.assessment.attempt).toBe('submitted');
  });

  it('a paper window cannot be started in the app; students of another class get 404', async () => {
    const paper = await createWin({ kind: 'pre', mode: 'paper' });
    await openWin(paper.id);
    expect((await startAs(0, paper)).status).toBe(409);
    const t2 = await registerTeacher(app, 'other@school.in');
    const c2 = await makeClass(app, t2, ['Zoya']);
    const tok2 = await studentLogin(app, c2.cls, c2.students[0]!);
    const w = await createWin({ kind: 'post' });
    await openWin(w.id);
    const r = await request(app).post(`/api/student/assessments/${w.id}/start`).set(auth(tok2)).send({ accessCode: w.accessCode });
    expect(r.status).toBe(404);
    const cur = await request(app).get('/api/student/assessments/current').set(auth(tok2));
    expect(cur.body.assessment).toBeNull();
  });

  it('reset_attempt lets a child start again', async () => {
    const w = await createWin();
    await openWin(w.id);
    await startAs(0, w);
    await submit(0, w.id);
    const r = await request(app).patch(`${base()}/${w.id}`).set(auth(teacher)).send({ action: 'reset_attempt', studentId: students[0]!.id });
    expect(r.status).toBe(200);
    const again = await startAs(0, w);
    expect(again.status).toBe(200);
    expect(again.body.attempt).toBe('in_progress');
  });

  it('update changes the form while still a draft only', async () => {
    const w = await createWin();
    const r = await request(app).patch(`${base()}/${w.id}`).set(auth(teacher)).send({ action: 'update', formId: 'B', durationMin: 30 });
    expect(r.body).toMatchObject({ formId: 'B', durationMin: 30 });
    await openWin(w.id);
    expect((await request(app).patch(`${base()}/${w.id}`).set(auth(teacher)).send({ action: 'update', formId: 'A' })).status).toBe(409);
  });
});

describe('autosave, deadline and auto-submit', () => {
  it('saves idempotently and validates choices', async () => {
    const w = await createWin();
    await openWin(w.id);
    const s = (await startAs(0, w)).body as StartAssessmentRes;
    const a1 = s.items.find((i) => i.section === 'A')!;
    expect((await put(0, w.id, [{ itemId: a1.id, answer: 'not a choice' }])).status).toBe(400);
    expect((await put(0, w.id, [{ itemId: 'zz9', answer: 'x' }])).status).toBe(400);
    const opt = (a1 as { options: string[] }).options[0]!;
    expect((await put(0, w.id, [{ itemId: a1.id, answer: opt, msElapsed: 1200 }])).status).toBe(200);
    expect((await put(0, w.id, [{ itemId: a1.id, answer: opt, msElapsed: 1500 }])).status).toBe(200);
    expect(await db.get('SELECT COUNT(*)::int AS n FROM assessment_responses')).toEqual({ n: 1 });
    const resumed = (await startAs(0, w)).body as StartAssessmentRes;
    expect(resumed.saved).toEqual([{ itemId: a1.id, answer: opt }]);
  });

  it('accepts a write within the 60 s grace, then 409s, and auto-submits and marks at the deadline', async () => {
    const w = await createWin();
    await openWin(w.id);
    const s = (await startAs(0, w)).body as StartAssessmentRes;
    const items = answersFor('A', s.items);
    await db.run('UPDATE assessment_attempts SET deadline_at = ?', [new Date(Date.now() - 30_000).toISOString()]);
    expect((await put(0, w.id, items.slice(0, 10))).status).toBe(200); // inside the grace window
    const deadline = new Date(Date.now() - 90_000).toISOString();
    await db.run('UPDATE assessment_attempts SET deadline_at = ?', [deadline]);
    const late = await put(0, w.id, items.slice(10));
    expect(late.status).toBe(409);
    const row = await db.get<{ submitted_at: string }>('SELECT submitted_at FROM assessment_attempts');
    expect(row!.submitted_at).toBe(deadline); // auto-submitted at the deadline
    const r = await results(w.id);
    const riya = r.rows.find((x: { studentId: number }) => x.studentId === students[0]!.id);
    expect(riya).toMatchObject({ status: 'submitted', a: expect.any(Number) });
    expect(riya.a).toBe(items.slice(0, 10).filter((x) => x.itemId.startsWith('a')).length);
    expect((await submit(0, w.id)).status).toBe(200); // idempotent
  });

  it('closing a window submits and marks in-progress attempts', async () => {
    const w = await createWin();
    await openWin(w.id);
    const s = (await startAs(0, w)).body as StartAssessmentRes;
    await put(0, w.id, answersFor('A', s.items));
    await request(app).patch(`${base()}/${w.id}`).set(auth(teacher)).send({ action: 'close' });
    const r = await results(w.id);
    expect(r.rows[0]).toMatchObject({ status: 'submitted', a: 10, b: 10, c: 10, total: 30 });
    expect((await put(0, w.id, [{ itemId: 'c1', answer: 'x' }])).status).toBe(409);
  });
});

describe('marking', () => {
  it('marks A and B exactly and C by the rules; total is out of 30', async () => {
    const w = await createWin();
    await openWin(w.id);
    const s = (await startAs(0, w)).body as StartAssessmentRes;
    await put(0, w.id, answersFor('A', s.items, { wrongA: 3 }));
    await submit(0, w.id);
    const r = await results(w.id);
    const riya = r.rows.find((x: { studentId: number }) => x.studentId === students[0]!.id);
    expect(riya).toMatchObject({ a: 7, b: 10, status: 'submitted', source: 'auto' });
    expect(riya.c).toBe(10);
    expect(riya.total).toBe(27);
    const notStarted = r.rows.find((x: { studentId: number }) => x.studentId === students[1]!.id);
    expect(notStarted).toMatchObject({ status: 'not_started', total: null });
  });

  it('case: wrong part of speech and blank answers earn 0; copied, irrelevant and missing-word sentences are handled', async () => {
    const w = await createWin();
    await openWin(w.id);
    const s = (await startAs(0, w)).body as StartAssessmentRes;
    const f = getForm('A');
    const bWrong = f.sectionB.map((i) => ({ itemId: i.id, answer: i.answer === 'noun' ? 'verb' : 'noun' }));
    const c = [
      { itemId: 'c1', answer: f.sectionC[0]!.exampleSentence }, // copied
      { itemId: 'c2', answer: 'I like to play with my friends today.' }, // word missing
      { itemId: 'c3', answer: '' }, // blank
      { itemId: 'c4', answer: GOOD_C.c4! },
    ];
    await put(0, w.id, [...bWrong, ...c]);
    await submit(0, w.id);
    const d = (await request(app).get(`${base()}/${w.id}/students/${students[0]!.id}`).set(auth(teacher))).body;
    expect(d.b).toBe(0);
    expect(d.a).toBe(0);
    const item = (id: string) => d.items.find((x: { itemId: string }) => x.itemId === id);
    expect(item('c1')).toMatchObject({ autoMarks: 1, needsReview: true });
    expect(item('c2')).toMatchObject({ autoMarks: 0, needsReview: true });
    expect(item('c3')).toMatchObject({ autoMarks: 0, needsReview: false, answer: '' });
    expect(item('c4').autoMarks).toBe(2);
    expect(item('c5').autoMarks).toBe(0);
    expect(d.items).toHaveLength(25);
    const row = (await results(w.id)).rows.find((x: { studentId: number }) => x.studentId === students[0]!.id);
    expect(row.needsReview).toBe(2);
  });
});

describe('override and manual precedence', () => {
  async function submitted() {
    const w = await createWin();
    await openWin(w.id);
    const s = (await startAs(0, w)).body as StartAssessmentRes;
    await put(0, w.id, answersFor('A', s.items, { c: { c1: 'The big hall has many chairs.' } }));
    await submit(0, w.id);
    return w;
  }
  const itemUrl = (w: { id: number }, item: string) => `${base()}/${w.id}/students/${students[0]!.id}/items/${item}`;

  it('final mark = override ?? auto, bounded per item, clearing restores auto, review count drops', async () => {
    const w = await submitted();
    const before = (await results(w.id)).rows[0];
    expect(before.c).toBe(2);
    expect(before.needsReview).toBe(0);
    const up = await request(app).patch(itemUrl(w, 'c1')).set(auth(teacher)).send({ overrideMarks: 0 });
    expect(up.status).toBe(200);
    expect((await results(w.id)).rows[0].c).toBe(0);
    expect((await request(app).patch(itemUrl(w, 'c1')).set(auth(teacher)).send({ overrideMarks: 3 })).status).toBe(400);
    expect((await request(app).patch(itemUrl(w, 'a1')).set(auth(teacher)).send({ overrideMarks: 2 })).status).toBe(400);
    const flagged = (await request(app).patch(itemUrl(w, 'c2')).set(auth(teacher)).send({ overrideMarks: 2 }));
    expect(flagged.status).toBe(200);
    expect((await results(w.id)).rows[0].c).toBe(2);
    await request(app).patch(itemUrl(w, 'c1')).set(auth(teacher)).send({ overrideMarks: null });
    expect((await results(w.id)).rows[0].c).toBe(4);
    const audit = await db.all("SELECT meta_json FROM audit_log WHERE action = 'assessment.override'");
    expect(audit.length).toBe(3);
  });

  it('manual paper totals win over auto marks; paper-mode windows work with manual only', async () => {
    const w = await submitted();
    const m = await request(app).put(`${base()}/${w.id}/students/${students[0]!.id}/manual`).set(auth(teacher)).send({ a: 5, b: 6, c: 7 });
    expect(m.status).toBe(200);
    expect((await results(w.id)).rows[0]).toMatchObject({ a: 5, b: 6, c: 7, total: 18, source: 'manual' });
    expect((await request(app).put(`${base()}/${w.id}/students/${students[0]!.id}/manual`).set(auth(teacher)).send({ a: 11, b: 0, c: 0 })).status).toBe(400);

    const post = await createWin({ kind: 'post', mode: 'paper' });
    expect((await results(post.id)).rows[0]).toMatchObject({ status: 'not_started', total: null });
    await request(app).put(`${base()}/${post.id}/students/${students[1]!.id}/manual`).set(auth(teacher)).send({ a: 9, b: 8, c: 4 });
    const rows = (await results(post.id)).rows;
    expect(rows.find((x: { studentId: number }) => x.studentId === students[1]!.id)).toMatchObject({ status: 'manual', total: 21, source: 'manual' });
  });

  it('assessmentScores (for F8) lists A/B/C/total per student and kind', async () => {
    const w = await submitted();
    await createWin({ kind: 'post', mode: 'paper' }).then((p) => request(app).put(`${base()}/${p.id}/students/${students[1]!.id}/manual`).set(auth(teacher)).send({ a: 1, b: 2, c: 3 }));
    const rows = await assessmentScores(db, cls.id);
    expect(rows).toContainEqual({ studentId: students[0]!.id, kind: 'pre', a: 10, b: 10, c: 2, total: 22, complete: true });
    expect(rows).toContainEqual({ studentId: students[1]!.id, kind: 'post', a: 1, b: 2, c: 3, total: 6, complete: true });
    expect(rows).toHaveLength(2);
    expect(w.id).toBeGreaterThan(0);
  });
});

describe('access control and printing', () => {
  it('teachers of other schools get 404; students and anonymous users cannot use teacher routes', async () => {
    const w = await createWin();
    const other = await registerTeacher(app, 'someone@else.in');
    for (const [method, url] of [['get', base()], ['post', base()], ['get', `${base()}/${w.id}/results`], ['get', `${base()}/${w.id}/students/${students[0]!.id}`]] as const) {
      const r = await request(app)[method](url).set(auth(other)).send({ kind: 'post' });
      expect(r.status, url).toBe(404);
    }
    expect((await request(app).get(base()).set(auth(tokens[0]!))).status).toBe(401);
    expect((await request(app).get(base())).status).toBe(401);
    expect((await request(app).get('/api/student/assessments/current').set(auth(teacher))).status).toBe(401);
    expect((await request(app).get('/api/student/assessments/current')).status).toBe(401);
    expect((await request(app).get('/api/assessment-forms/A/print').set(auth(tokens[0]!))).status).toBe(401);
    // a window id from this class used under a different class path is 404
    const t2 = await registerTeacher(app, 'second@school.in');
    const c2 = await makeClass(app, t2, ['Zoya']);
    expect((await request(app).get(`/api/classes/${c2.cls.id}/assessments/${w.id}/results`).set(auth(t2))).status).toBe(404);
  });

  it('serves the printable form with key and marking scheme to teachers', async () => {
    const r = await request(app).get('/api/assessment-forms/B/print').set(auth(teacher));
    expect(r.status).toBe(200);
    expect(r.body.formId).toBe('B');
    expect(r.body.sectionA).toHaveLength(10);
    expect(r.body.sectionA[0].answer).toBeTruthy();
    expect(r.body.scheme.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/assessment-forms/Z/print').set(auth(teacher))).status).toBe(404);
  });
});
