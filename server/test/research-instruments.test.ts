import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { DB } from '../src/db/db.ts';
import { instrumentSummary } from '../src/services/research/instruments.ts';
import { auth, closeTestDb, makeClass, makeSchool, registerTeacher, setup, studentLogin } from './helpers.ts';

let app: Express;
let db: DB;
beforeEach(async () => { ({ app, db } = await setup()); });
afterAll(closeTestDb);

const ans = (a: string[]) => a.map((answer, i) => ({ itemNo: i + 1, answer }));

async function world() {
  const school = await makeSchool(app);
  const t = await registerTeacher(app, 'patil@school.in', school);
  const a = await makeClass(app, t, ['Riya', 'Aarav', 'Kabir'], undefined, 'A');
  const study = (await request(app).post('/api/studies').set(auth(t)).send({ name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body;
  const parts = (await request(app).get(`/api/studies/${study.id}/participants`).set(auth(t))).body as { studentId: number; studyCode: string }[];
  for (const p of parts.slice(0, 2)) await request(app).patch(`/api/studies/${study.id}/participants/${p.studentId}`).set(auth(t)).send({ consent: 'given' });
  const tokens = await Promise.all(a.students.map((s) => studentLogin(app, a.cls, s)));
  return { school, t, a, id: study.id as number, parts, tokens };
}

describe('F9 observations', () => {
  it('upserts per (study, student, week) and merges partial updates', async () => {
    const { t, id, parts } = await world();
    const sid = parts[0]!.studentId;
    const url = `/api/studies/${id}/observations`;
    expect((await request(app).put(url).set(auth(t)).send({ studentId: sid, week: 1, values: { accesses: true, meanings: false } })).status).toBe(200);
    expect((await request(app).put(url).set(auth(t)).send({ studentId: sid, week: 1, values: { meanings: true, revises: false } })).status).toBe(200);
    expect((await request(app).put(url).set(auth(t)).send({ studentId: sid, week: 2, values: { pos: true } })).status).toBe(200);
    const w1 = await request(app).get(`${url}?week=1`).set(auth(t));
    expect(w1.body.rows).toHaveLength(3);
    const row = w1.body.rows.find((r: { studentId: number }) => r.studentId === sid);
    expect(row.values).toEqual({ accesses: true, meanings: true, pos: null, sentences: null, participates: null, revises: false });
    const count = await db.get<{ n: number }>('SELECT count(*)::int AS n FROM observation_records WHERE study_id = ? AND student_id = ?', [id, sid]);
    expect(count!.n).toBe(2);
    // clear an indicator
    await request(app).put(url).set(auth(t)).send({ studentId: sid, week: 1, values: { accesses: null } });
    const again = await request(app).get(`${url}?week=1`).set(auth(t));
    expect(again.body.rows.find((r: { studentId: number }) => r.studentId === sid).values.accesses).toBeNull();
  });

  it('validates input and hides other schools and non-participants', async () => {
    const { t, id, parts } = await world();
    const url = `/api/studies/${id}/observations`;
    const sid = parts[0]!.studentId;
    expect((await request(app).put(url).set(auth(t)).send({ studentId: sid, week: 9, values: { accesses: true } })).status).toBe(400);
    expect((await request(app).put(url).set(auth(t)).send({ studentId: sid, week: 1, values: { nope: true } })).status).toBe(400);
    expect((await request(app).put(url).set(auth(t)).send({ studentId: sid, week: 1, values: { accesses: 'yes' } })).status).toBe(400);
    expect((await request(app).put(url).set(auth(t)).send({ studentId: 999999, week: 1, values: { accesses: true } })).status).toBe(404);
    expect((await request(app).get(`${url}?week=0`).set(auth(t))).status).toBe(400);
    expect((await request(app).get(url)).status).toBe(401);
    const other = await registerTeacher(app, 'other@elsewhere.in', await makeSchool(app, 'Other'));
    expect((await request(app).get(`${url}?week=1`).set(auth(other))).status).toBe(404);
    expect((await request(app).put(url).set(auth(other)).send({ studentId: sid, week: 1, values: { accesses: true } })).status).toBe(404);
  });
});

describe('F9 feedback', () => {
  it('is closed until the teacher opens it; students answer all five, can change until closed', async () => {
    const { t, id, tokens } = await world();
    const post = (i: number, answers: unknown) => request(app).post('/api/student/feedback').set(auth(tokens[i]!)).send({ answers });
    const before = await request(app).get('/api/student/feedback').set(auth(tokens[0]!));
    expect(before.body.open).toBe(false);
    expect(before.body.items).toHaveLength(5);
    expect((await post(0, ans(['yes', 'yes', 'yes', 'yes', 'yes']))).status).toBe(409);

    const opened = await request(app).patch(`/api/studies/${id}/feedback-window`).set(auth(t)).send({ open: true });
    expect(opened.body.open).toBe(true);
    expect((await request(app).get('/api/student/feedback').set(auth(tokens[0]!))).body.open).toBe(true);
    expect((await post(0, ans(['yes', 'yes']))).status).toBe(400);
    expect((await post(0, ans(['yes', 'maybe', 'yes', 'yes', 'yes']))).status).toBe(400);
    expect((await post(0, ans(['yes', 'some', 'no', 'yes', 'some']))).status).toBe(200);
    expect((await post(0, ans(['no', 'some', 'no', 'yes', 'some']))).status).toBe(200);
    const mine = await request(app).get('/api/student/feedback').set(auth(tokens[0]!));
    expect(mine.body.answers).toEqual(['no', 'some', 'no', 'yes', 'some']);
    const n = await db.get<{ n: number }>('SELECT count(*)::int AS n FROM feedback_responses WHERE study_id = ?', [id]);
    expect(n!.n).toBe(5);

    await request(app).patch(`/api/studies/${id}/feedback-window`).set(auth(t)).send({ open: false });
    expect((await post(0, ans(['yes', 'yes', 'yes', 'yes', 'yes']))).status).toBe(409);
    expect((await request(app).get('/api/student/feedback').set(auth(tokens[0]!))).body.open).toBe(false);
  });

  it('a student without consent (not an analysable participant) gets 404', async () => {
    const { t, id, tokens } = await world();
    await request(app).patch(`/api/studies/${id}/feedback-window`).set(auth(t)).send({ open: true });
    expect((await request(app).get('/api/student/feedback').set(auth(tokens[2]!))).status).toBe(404);
    expect((await request(app).post('/api/student/feedback').set(auth(tokens[2]!)).send({ answers: ans(['yes', 'yes', 'yes', 'yes', 'yes']) })).status).toBe(404);
    expect((await request(app).get('/api/student/feedback')).status).toBe(401);
  });

  it('teacher enters paper answers (any window state), sees rows, 404 for other schools', async () => {
    const { t, id, parts } = await world();
    const sid = parts[1]!.studentId;
    const put = await request(app).put(`/api/studies/${id}/feedback/${sid}`).set(auth(t)).send({ answers: [{ itemNo: 2, answer: 'some' }, { itemNo: 5, answer: 'yes' }] });
    expect(put.status).toBe(200);
    expect((await request(app).put(`/api/studies/${id}/feedback/${sid}`).set(auth(t)).send({ answers: [{ itemNo: 6, answer: 'yes' }] })).status).toBe(400);
    expect((await request(app).put(`/api/studies/${id}/feedback/999999`).set(auth(t)).send({ answers: [{ itemNo: 1, answer: 'yes' }] })).status).toBe(404);
    const g = await request(app).get(`/api/studies/${id}/feedback`).set(auth(t));
    const row = g.body.rows.find((r: { studentId: number }) => r.studentId === sid);
    expect(row.answers).toEqual([null, 'some', null, null, 'yes']);
    expect(row.source).toBe('paper');
    const other = await registerTeacher(app, 'other@elsewhere.in', await makeSchool(app, 'Other'));
    expect((await request(app).get(`/api/studies/${id}/feedback`).set(auth(other))).status).toBe(404);
    expect((await request(app).patch(`/api/studies/${id}/feedback-window`).set(auth(other)).send({ open: true })).status).toBe(404);
  });
});

describe('F9 summary and withdrawal', () => {
  it('summary counts only analysable participants and has no identifiers', async () => {
    const { t, id, parts, tokens } = await world();
    const [p1, p2, p3] = parts as [typeof parts[0], typeof parts[0], typeof parts[0]];
    const obs = (sid: number, week: number, values: object) => request(app).put(`/api/studies/${id}/observations`).set(auth(t)).send({ studentId: sid, week, values });
    await obs(p1.studentId, 1, { accesses: true, meanings: false });
    await obs(p2.studentId, 1, { accesses: true });
    await obs(p3.studentId, 1, { accesses: true }); // not consented: excluded from the summary
    await request(app).patch(`/api/studies/${id}/feedback-window`).set(auth(t)).send({ open: true });
    await request(app).post('/api/student/feedback').set(auth(tokens[0]!)).send({ answers: ans(['yes', 'yes', 'some', 'no', 'yes']) });
    await request(app).put(`/api/studies/${id}/feedback/${p2.studentId}`).set(auth(t)).send({ answers: ans(['yes', 'no', 'some', 'no', 'yes']) });
    const s = await instrumentSummary(db, id);
    expect(s.participants).toBe(2);
    expect(s.observation.weeks).toHaveLength(1);
    const acc = s.observation.weeks[0]!.indicators.find((i) => i.key === 'accesses')!;
    expect(acc).toMatchObject({ yes: 2, no: 0, notObserved: 0 });
    expect(s.observation.weeks[0]!.indicators.find((i) => i.key === 'meanings')).toMatchObject({ yes: 0, no: 1, notObserved: 1 });
    expect(s.feedback.respondents).toBe(2);
    expect(s.feedback.items[1]).toMatchObject({ itemNo: 2, yes: 1, no: 1, some: 0, n: 2, pctYes: 50, pctNo: 50 });
    expect(s.feedback.items[2]).toMatchObject({ some: 2, pctSome: 100 });
    expect(JSON.stringify(s)).not.toMatch(/studentId|firstName|Riya/);
  });

  it('withdrawal deletes the child\'s observation and feedback rows', async () => {
    const { t, id, parts } = await world();
    const sid = parts[0]!.studentId;
    await request(app).put(`/api/studies/${id}/observations`).set(auth(t)).send({ studentId: sid, week: 1, values: { accesses: true } });
    await request(app).put(`/api/studies/${id}/feedback/${sid}`).set(auth(t)).send({ answers: ans(['yes', 'yes', 'yes', 'yes', 'yes']) });
    const del = await request(app).delete(`/api/studies/${id}/participants/${sid}/research-data`).set(auth(t));
    expect(del.status).toBe(200);
    expect((await db.get<{ n: number }>('SELECT count(*)::int AS n FROM observation_records WHERE student_id = ?', [sid]))!.n).toBe(0);
    expect((await db.get<{ n: number }>('SELECT count(*)::int AS n FROM feedback_responses WHERE student_id = ?', [sid]))!.n).toBe(0);
  });
});
