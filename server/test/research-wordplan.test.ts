import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { DB } from '../src/db/db.ts';
import { auth, closeTestDb, FAKE_TODAY, makeClass, makeSchool, registerTeacher, setup, studentLogin } from './helpers.ts';

let app: Express;
let db: DB;
beforeEach(async () => { ({ app, db } = await setup()); });
afterAll(closeTestDb);

const root = resolve(import.meta.dirname, '../..');
const planFile = JSON.parse(readFileSync(resolve(root, 'content/study/word-a-day-100.json'), 'utf8')) as { days: { day: number; wordIds: string[] }[] };

// Study starts Monday 2026-11-16; FAKE_TODAY is Friday 2026-11-20 = study day 5.
async function world() {
  const school = await makeSchool(app);
  const t = await registerTeacher(app, 'patil@school.in', school);
  const a = await makeClass(app, t, ['Riya', 'Aarav'], undefined, 'A');
  const b = await makeClass(app, t, ['Meera'], undefined, 'B');
  const st = await request(app).post('/api/studies').set(auth(t)).send({
    name: 'Word-a-Day', startDate: '2026-11-16',
    classes: [{ classId: a.cls.id, group: 'intervention' }, { classId: b.cls.id, group: 'comparison' }],
  });
  expect(st.status).toBe(201);
  const studyId = st.body.id as number;
  await request(app).patch(`/api/studies/${studyId}`).set(auth(t)).send({ status: 'running' });
  const ta = await studentLogin(app, a.cls, a.students[0]!);
  const tb = await studentLogin(app, b.cls, b.students[0]!);
  return { t, a, b, studyId, ta, tb };
}
const today = (token: string) => request(app).post('/api/student/sessions/today').set(auth(token)).send({});
const day = (token: string) => request(app).get('/api/student/study-day').set(auth(token));

describe('F2 plan file', () => {
  it('is 20 days x 5 distinct bank words, balanced, and includes every word of forms A and B', () => {
    expect(planFile.days).toHaveLength(20);
    const ids = planFile.days.flatMap((d) => { expect(d.wordIds).toHaveLength(5); return d.wordIds; });
    expect(new Set(ids).size).toBe(100);
    const dir = resolve(root, 'content/words');
    const bank = new Map<string, { partOfSpeech: string; difficulty: number }>();
    for (const f of readdirSync(dir).filter((x) => x.startsWith('part-'))) for (const w of JSON.parse(readFileSync(resolve(dir, f), 'utf8'))) bank.set(w.id, w);
    const pos: Record<string, number> = {};
    for (const id of ids) {
      const w = bank.get(id);
      expect(w, id).toBeTruthy();
      pos[w!.partOfSpeech] = (pos[w!.partOfSpeech] ?? 0) + 1;
      expect(w!.difficulty).toBeLessThanOrEqual(2);
    }
    expect(pos).toEqual({ noun: 35, verb: 25, adjective: 25, adverb: 15 });
    for (const n of ['a', 'b']) {
      const f = JSON.parse(readFileSync(resolve(root, `server/src/research/assessment-forms/form-${n}.json`), 'utf8'));
      for (const s of ['sectionA', 'sectionB', 'sectionC']) for (const i of f[s] as { wordId?: string }[]) if (i.wordId) expect(ids, `${n} ${i.wordId}`).toContain(i.wordId);
    }
  });
});

describe('F2 study day and gate', () => {
  it('Friday is study day 5 with the planned words; override wins', async () => {
    const { t, a, studyId, ta } = await world();
    const ids = ['d010-1', 'd010-2', 'd010-3', 'd010-4', 'd010-5'];
    const put = await request(app).put(`/api/studies/${studyId}/plan/5`).set(auth(t)).send({ wordIds: ids });
    expect(put.status).toBe(200);
    expect(put.body.days[4].words.map((w: { wordId: string }) => w.wordId)).toEqual(ids);
    expect((await day(ta)).body).toMatchObject({ inStudy: true, group: 'intervention', dayNo: 5, totalDays: 20, reason: 'study_day' });
    const s = await today(ta);
    expect(s.status).toBe(200);
    expect(s.body.words.map((w: { id: string }) => w.id)).toEqual(ids);
    // teacher override for the date still wins
    const over = ['d004-1', 'd004-2', 'd004-3', 'd004-4', 'd004-5'];
    await request(app).put(`/api/classes/${a.cls.id}/daily-words/${FAKE_TODAY}`).set(auth(t)).send({ wordIds: over });
    const daily = await request(app).get(`/api/classes/${a.cls.id}/daily-words?date=${FAKE_TODAY}`).set(auth(t));
    expect(daily.body.source).toBe('teacher');
    expect(daily.body.words.map((w: { id: string }) => w.id)).toEqual(over);
  });

  it('Saturday is 409 no_study_day, Monday is day 6', async () => {
    const { t, a, studyId, ta } = await world();
    const ids = ['d010-1', 'd010-2', 'd010-3', 'd010-4', 'd010-5'];
    await request(app).put(`/api/studies/${studyId}/plan/6`).set(auth(t)).send({ wordIds: ids });
    process.env.FAKE_TODAY = '2026-11-21';
    const sat = await today(ta);
    expect(sat.status).toBe(409);
    expect(sat.body.error).toMatchObject({ code: 'conflict', message: 'no_study_day' });
    expect((await day(ta)).body).toMatchObject({ inStudy: false, dayNo: null, reason: 'weekend' });
    process.env.FAKE_TODAY = '2026-11-23';
    expect((await day(ta)).body).toMatchObject({ inStudy: true, dayNo: 6 });
    const mon = await today(ta);
    expect(mon.status).toBe(200);
    expect(mon.body.words.map((w: { id: string }) => w.id)).toEqual(ids);
    const daily = await request(app).get(`/api/classes/${a.cls.id}/daily-words?date=2026-11-23`).set(auth(t));
    expect(daily.body.dayIndex).toBe(6);
  });

  it('a holiday moves the words to the next school day', async () => {
    const { t, studyId, ta } = await world();
    const hol = await request(app).put(`/api/studies/${studyId}/holidays`).set(auth(t)).send({ dates: ['2026-11-20'] });
    expect(hol.status).toBe(200);
    expect(hol.body.holidays).toEqual(['2026-11-20']);
    expect(hol.body.days[3].date).toBe('2026-11-19');
    expect(hol.body.days[4].date).toBe('2026-11-23');
    expect((await day(ta)).body).toMatchObject({ inStudy: false, reason: 'holiday' });
    expect((await today(ta)).status).toBe(409);
    process.env.FAKE_TODAY = '2026-11-23';
    expect((await day(ta)).body).toMatchObject({ dayNo: 5 });
  });

  it('comparison class gets 409 and reason comparison', async () => {
    const { tb } = await world();
    expect((await today(tb)).status).toBe(409);
    expect((await day(tb)).body).toMatchObject({ inStudy: false, group: 'comparison', reason: 'comparison' });
  });

  it('before the start and after the last day it is 409; a closed study returns to normal', async () => {
    const { t, studyId, ta } = await world();
    process.env.FAKE_TODAY = '2026-11-13';
    expect((await day(ta)).body.reason).toBe('not_started');
    expect((await today(ta)).status).toBe(409);
    process.env.FAKE_TODAY = '2026-12-15';
    expect((await day(ta)).body.reason).toBe('finished');
    expect((await today(ta)).status).toBe(409);
    await request(app).patch(`/api/studies/${studyId}`).set(auth(t)).send({ status: 'closed' });
    expect((await today(ta)).status).toBe(200);
    expect((await day(ta)).body).toMatchObject({ inStudy: false, reason: 'no_study' });
  });

  it('a class with no study behaves as before, even on a Saturday', async () => {
    const school = await makeSchool(app);
    const t = await registerTeacher(app, 'x@school.in', school);
    const c = await makeClass(app, t, ['Riya']);
    const tok = await studentLogin(app, c.cls, c.students[0]!);
    process.env.FAKE_TODAY = '2026-11-21';
    expect((await today(tok)).status).toBe(200);
    expect((await day(tok)).body).toMatchObject({ inStudy: false, reason: 'no_study' });
  });

  it('a study in setup status does not gate the class', async () => {
    const school = await makeSchool(app);
    const t = await registerTeacher(app, 'y@school.in', school);
    const c = await makeClass(app, t, ['Riya']);
    await request(app).post('/api/studies').set(auth(t)).send({ name: 'S', classes: [{ classId: c.cls.id, group: 'comparison' }] });
    const tok = await studentLogin(app, c.cls, c.students[0]!);
    expect((await today(tok)).status).toBe(200);
  });
});

describe('F2 plan API', () => {
  it('seeds the plan, counts parts of speech, warns about few adverbs and validates input', async () => {
    const { t, studyId } = await world();
    const p = await request(app).get(`/api/studies/${studyId}/plan`).set(auth(t));
    expect(p.status).toBe(200);
    expect(p.body.days).toHaveLength(20);
    expect(p.body.days[0].date).toBe('2026-11-16');
    // the mini test bank has no adverbs, so the balance warning shows
    expect(p.body.warnings.join(' ')).toMatch(/adverb/);
    const bad = (body: object, dayNo = 1) => request(app).put(`/api/studies/${studyId}/plan/${dayNo}`).set(auth(t)).send(body);
    expect((await bad({ wordIds: ['d010-1'] })).status).toBe(400);
    expect((await bad({ wordIds: ['d010-1', 'd010-1', 'd010-2', 'd010-3', 'd010-4'] })).status).toBe(400);
    expect((await bad({ wordIds: ['nope-1', 'd010-2', 'd010-3', 'd010-4', 'd010-5'] })).status).toBe(400);
    expect((await bad({ wordIds: ['d010-1', 'd010-2', 'd010-3', 'd010-4', 'd010-5'] }, 21)).status).toBe(400);
    expect((await request(app).put(`/api/studies/${studyId}/holidays`).set(auth(t)).send({ dates: ['soon'] })).status).toBe(400);
    expect((await request(app).get(`/api/studies/${studyId}/plan`)).status).toBe(401);
    const n = await db.get<{ n: number }>('SELECT count(*)::int AS n FROM study_plan WHERE study_id = ?', [studyId]);
    expect(n!.n).toBeGreaterThan(0);
  });

  it('another school cannot read or change the plan', async () => {
    const { studyId } = await world();
    const other = await registerTeacher(app, 'other@school.in');
    expect((await request(app).get(`/api/studies/${studyId}/plan`).set(auth(other))).status).toBe(404);
    expect((await request(app).put(`/api/studies/${studyId}/holidays`).set(auth(other)).send({ dates: [] })).status).toBe(404);
  });
});
