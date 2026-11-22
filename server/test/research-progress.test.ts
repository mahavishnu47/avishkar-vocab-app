import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProgressRes, RecallItem, TodaySessionRes } from '@shabd/core';
import { auth, closeTestDb, makeClass, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';

const DAY1 = '2026-11-19'; // Thursday
const DAY2 = '2026-11-20'; // Friday
let ctx: Ctx;
let teacher: string;
let classId: number;
let tokA: string;
let tokB: string;
let day1: TodaySessionRes;

const uuid = () => crypto.randomUUID();
const ts = () => new Date().toISOString();
const att = (sid: number, body: object, t = tokA) => request(ctx.app).post(`/api/student/sessions/${sid}/attempts`).set(auth(t)).send(body);
const complete = (sid: number, wordId: string, t = tokA) => request(ctx.app).post(`/api/student/sessions/${sid}/words/${wordId}/complete`).set(auth(t)).send({});
const get = (q = '', t = teacher, id = classId) => request(ctx.app).get(`/api/classes/${id}/progress${q}`).set(auth(t));
const row = (b: ProgressRes, name: string) => b.students.find((s) => s.firstName === name)!;

beforeEach(async () => {
  ctx = await setup();
  process.env.FAKE_TODAY = DAY1;
  teacher = await registerTeacher(ctx.app);
  const { cls, students } = await makeClass(ctx.app, teacher, ['Riya', 'Aarav', 'Kabir'], DAY1);
  classId = cls.id;
  tokA = await studentLogin(ctx.app, cls, students[0]!);
  tokB = await studentLogin(ctx.app, cls, students[1]!);
  day1 = (await request(ctx.app).post('/api/student/sessions/today').set(auth(tokA)).send({})).body;
  const sid = day1.session.id;
  const [w0, w1, w2] = day1.words;
  // meaning: w0 right first time, w1 wrong then right => 1 of 2 first-try
  expect((await att(sid, { meaning: [
    { clientId: uuid(), wordId: w0!.id, attemptNo: 1, chosen: w0!.meaning, isCorrect: true, msElapsed: 1, clientTs: ts() },
    { clientId: uuid(), wordId: w1!.id, attemptNo: 1, chosen: w1!.distractorMeanings[0], isCorrect: false, msElapsed: 1, clientTs: ts() },
    { clientId: uuid(), wordId: w1!.id, attemptNo: 2, chosen: w1!.meaning, isCorrect: true, msElapsed: 1, clientTs: ts() },
  ] })).status).toBe(200);
  // pos: w0 right, w1 wrong, w2 right => 2 of 3 first-try
  const other = (p: string) => (p === 'noun' ? 'verb' : 'noun');
  expect((await att(sid, { pos: [
    { clientId: uuid(), wordId: w0!.id, attemptNo: 1, chosen: w0!.partOfSpeech, msElapsed: 1, clientTs: ts() },
    { clientId: uuid(), wordId: w1!.id, attemptNo: 1, chosen: other(w1!.partOfSpeech), msElapsed: 1, clientTs: ts() },
    { clientId: uuid(), wordId: w2!.id, attemptNo: 1, chosen: w2!.partOfSpeech, msElapsed: 1, clientTs: ts() },
  ] })).status).toBe(200);
  const s = await request(ctx.app).post(`/api/student/sessions/${sid}/sentences`).set(auth(tokA)).send({
    clientId: uuid(), wordId: w0!.id, submissionNo: 1, text: `I cook in the ${w0!.word} because it is big and clean.`, starterHintUsed: false, msElapsed: 9000, clientTs: ts(),
  });
  expect(s.status).toBe(200);
  for (const w of day1.words) await complete(sid, w.id);
  expect((await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(tokA)).send({})).status).toBe(200);
  // Aarav starts and finishes 2 words only.
  const b = (await request(ctx.app).post('/api/student/sessions/today').set(auth(tokB)).send({})).body as TodaySessionRes;
  await complete(b.session.id, b.words[0]!.id, tokB);
  await complete(b.session.id, b.words[1]!.id, tokB);
  // Day 2: Riya starts, finishes 1 word and plays the recall challenge (1 right, 1 wrong).
  process.env.FAKE_TODAY = DAY2;
  const d2 = (await request(ctx.app).post('/api/student/sessions/today').set(auth(tokA)).send({})).body as TodaySessionRes;
  await complete(d2.session.id, d2.words[0]!.id);
  const items = (await request(ctx.app).get('/api/student/recall/today').set(auth(tokA))).body.items as RecallItem[];
  const m = items.find((i) => i.kind === 'meaning')!;
  const mw = day1.words.find((w) => w.id === m.wordId)!;
  const p = items.find((i) => i.kind === 'pos')!;
  const pw = day1.words.find((w) => w.id === p.wordId)!;
  const r = await request(ctx.app).post('/api/student/recall/answers').set(auth(tokA)).send({ answers: [
    { clientId: uuid(), itemId: m.itemId, chosen: mw.meaning, msElapsed: 1, clientTs: ts() },
    { clientId: uuid(), itemId: p.itemId, chosen: p.options.find((o) => o !== pw.partOfSpeech)!, msElapsed: 1, clientTs: ts() },
  ] });
  expect(r.status).toBe(200);
});
afterAll(closeTestDb);

describe('progress tracker (F7)', () => {
  it('counts days, words and every accuracy metric per student (no study: last 28 weekdays)', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    const body = r.body as ProgressRes;
    expect(body).toMatchObject({ classId, to: DAY2, inStudy: false, wordsPerDay: 5 });
    expect(body.days).toContain(DAY1);
    expect(body.days.every((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))).toBe(true);
    expect(body.students.map((s) => s.firstName)).toEqual(['Riya', 'Aarav', 'Kabir']);

    const riya = row(body, 'Riya');
    expect(riya).toMatchObject({ studyCode: null, daysActive: 2, daysCompleted: 1, wordsCompleted: 6, meaningFirstTryPct: 50, posFirstTryPct: 66.7, recallPct: 50, lastActive: DAY2 });
    expect(riya.grid[DAY1]).toBe(5);
    expect(riya.grid[DAY2]).toBe(1);
    const raw = await ctx.db.get<{ raw_total: number }>('SELECT raw_total FROM sentence_submissions WHERE counted = 1');
    expect(riya.sentenceAvgPct).toBe(Math.round((Number(raw!.raw_total) / 40) * 1000) / 10);
    expect(riya.sentenceAvgPct).toBeGreaterThan(0);

    const aarav = row(body, 'Aarav');
    expect(aarav).toMatchObject({ daysActive: 1, daysCompleted: 0, wordsCompleted: 2, meaningFirstTryPct: null, posFirstTryPct: null, sentenceAvgPct: null, recallPct: null, lastActive: DAY1 });
    expect(aarav.grid[DAY1]).toBe(2);
    expect(aarav.grid[DAY2]).toBeNull();

    const kabir = row(body, 'Kabir');
    expect(kabir).toMatchObject({ daysActive: 0, wordsCompleted: 0, lastActive: null });
    expect(Object.values(kabir.grid).every((v) => v === null)).toBe(true);
  });

  it('from/to narrow the window and are validated', async () => {
    const one = (await get(`?from=${DAY1}&to=${DAY1}`)).body as ProgressRes;
    expect(one.days).toEqual([DAY1]);
    expect(row(one, 'Riya')).toMatchObject({ daysActive: 1, wordsCompleted: 5, recallPct: null, lastActive: DAY1 });
    expect((await get('?from=nope')).status).toBe(400);
    expect((await get(`?from=${DAY2}&to=${DAY1}`)).status).toBe(400);
  });

  it('follows the study school days (weekends and holidays excluded) and shows study codes', async () => {
    const st = await request(ctx.app).post('/api/studies').set(auth(teacher)).send({
      name: 'Word-a-Day', startDate: '2026-11-16', schoolDays: 20, classes: [{ classId, group: 'intervention' }],
    });
    expect(st.status).toBe(201);
    const body = (await get()).body as ProgressRes;
    expect(body.inStudy).toBe(true);
    expect(body.days).toHaveLength(20);
    expect(body.from).toBe('2026-11-16');
    expect(body.to).toBe('2026-12-11');
    expect(body.days).not.toContain('2026-11-21');
    expect(body.days).not.toContain('2026-11-22');
    expect(body.students.map((s) => s.studyCode)).toEqual(['S01', 'S02', 'S03']);
    expect(row(body, 'Riya')).toMatchObject({ wordsCompleted: 6, daysActive: 2 });
    // a session on a non-study date (Saturday) is left out
    await ctx.db.run(
      `INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, scoring_version) SELECT id, class_id, '2026-11-21', 6, '[]', 'x' FROM students WHERE first_name = 'Kabir'`,
    );
    expect(row((await get()).body, 'Kabir').daysActive).toBe(0);
  });

  it('is teacher-only and tenant-scoped', async () => {
    expect((await request(ctx.app).get(`/api/classes/${classId}/progress`)).status).toBe(401);
    expect((await request(ctx.app).get(`/api/classes/${classId}/progress`).set(auth(tokA))).status).toBe(401);
    const other = await registerTeacher(ctx.app, 'other@school.in');
    expect((await get('', other)).status).toBe(404);
    expect((await get('', teacher, 9999)).status).toBe(404);
  });
});
