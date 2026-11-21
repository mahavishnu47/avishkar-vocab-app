import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BankRes, RecallAnswerWrite, RecallItem, RecallTodayRes, TodaySessionRes } from '@shabd/core';
import { auth, makeClass, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';

const DAY1 = '2026-11-19';
const DAY2 = '2026-11-20';
let ctx: Ctx;
let tokA: string;
let tokB: string;
let day1: TodaySessionRes;

const uuid = () => crypto.randomUUID();
const ts = () => new Date().toISOString();
const getToday = (t = tokA) => request(ctx.app).get('/api/student/recall/today').set(auth(t));
const answer = (item: RecallItem, chosen: string, extra: object = {}): RecallAnswerWrite & object =>
  ({ clientId: uuid(), itemId: item.itemId, chosen, msElapsed: 900, clientTs: ts(), ...extra });
const post = (answers: object[], t = tokA) => request(ctx.app).post('/api/student/recall/answers').set(auth(t)).send({ answers });

beforeEach(async () => {
  ctx = await setup();
  process.env.FAKE_TODAY = DAY1;
  const teacher = await registerTeacher(ctx.app);
  const { cls, students } = await makeClass(ctx.app, teacher, ['Riya', 'Aarav'], DAY1);
  tokA = await studentLogin(ctx.app, cls, students[0]!);
  tokB = await studentLogin(ctx.app, cls, students[1]!);
  // Riya completes day 1 with a sentence for the first word; Aarav only plays the first word of day 1.
  day1 = (await request(ctx.app).post('/api/student/sessions/today').set(auth(tokA)).send({})).body;
  const sid = day1.session.id;
  const w0 = day1.words[0]!;
  const s = await request(ctx.app).post(`/api/student/sessions/${sid}/sentences`).set(auth(tokA)).send({
    clientId: uuid(), wordId: w0.id, submissionNo: 1, text: `I cook in the ${w0.word} because it is big and clean.`, starterHintUsed: false, msElapsed: 9000, clientTs: ts(),
  });
  expect(s.status).toBe(200);
  for (const w of day1.words) await request(ctx.app).post(`/api/student/sessions/${sid}/words/${w.id}/complete`).set(auth(tokA)).send({});
  expect((await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(tokA)).send({})).status).toBe(200);
  const b = (await request(ctx.app).post('/api/student/sessions/today').set(auth(tokB)).send({})).body as TodaySessionRes;
  await request(ctx.app).post(`/api/student/sessions/${b.session.id}/words/${b.words[0]!.id}/complete`).set(auth(tokB)).send({});
  process.env.FAKE_TODAY = DAY2;
});

describe('recall challenge (F6)', () => {
  it('needs a completed earlier session: nothing to revise on day 1, and B has none either', async () => {
    const r = await getToday(tokB);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ items: [], alreadyDone: false });
    process.env.FAKE_TODAY = DAY1;
    expect((await getToday(tokA)).body.items).toEqual([]);
  });

  it('serves items from the previous session only, alternating kinds, with no answers in the payload', async () => {
    const r = await getToday();
    const body = r.body as RecallTodayRes;
    expect(r.status).toBe(200);
    const ids = day1.words.map((w) => w.id);
    expect(body.items).toHaveLength(5);
    expect(body.items.map((i) => i.wordId).sort()).toEqual([...ids].sort());
    expect(body.items.map((i) => i.kind)).toEqual(['meaning', 'pos', 'meaning', 'pos', 'meaning']);
    for (const i of body.items) {
      expect(Object.keys(i).sort()).toEqual(['itemId', 'kind', 'options', 'prompt', 'word', 'wordId']);
      expect(i.options).toHaveLength(i.kind === 'pos' ? 4 : 3);
    }
    expect(JSON.stringify(body)).not.toMatch(/isCorrect|correct|answer|partOfSpeech/i);
    // deterministic per student + date
    expect((await getToday()).body).toEqual(body);
  });

  it('derives correctness on the server and ignores a client isCorrect claim', async () => {
    const items = (await getToday()).body.items as RecallItem[];
    const m = items.find((i) => i.kind === 'meaning')!;
    const p = items.find((i) => i.kind === 'pos')!;
    const word = day1.words.find((w) => w.id === m.wordId)!;
    const pword = day1.words.find((w) => w.id === p.wordId)!;
    const wrongPos = p.options.find((o) => o !== pword.partOfSpeech)!;
    const r = await post([answer(m, word.meaning, { isCorrect: false }), answer(p, wrongPos, { isCorrect: true })]);
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([
      { itemId: m.itemId, isCorrect: true, correctAnswer: word.meaning, counted: true },
      { itemId: p.itemId, isCorrect: false, correctAnswer: pword.partOfSpeech, counted: true },
    ]);
    const rows = await ctx.db.all('SELECT kind, is_correct, counted FROM recall_attempts ORDER BY id');
    expect(rows).toEqual([{ kind: 'meaning', is_correct: 1, counted: 1 }, { kind: 'pos', is_correct: 0, counted: 1 }]);
    expect((await getToday()).body.alreadyDone).toBe(true);
  });

  it('is idempotent on clientId, and only the first play of a date counts', async () => {
    const m = ((await getToday()).body.items as RecallItem[])[0]!;
    const word = day1.words.find((w) => w.id === m.wordId)!;
    const a = answer(m, m.options.find((o) => o !== word.meaning)!);
    const first = await post([a]);
    const again = await post([a]);
    expect(again.body).toEqual(first.body);
    expect(await ctx.db.all('SELECT 1 FROM recall_attempts')).toHaveLength(1);
    const replay = await post([answer(m, word.meaning)]);
    expect(replay.body.results[0]).toMatchObject({ isCorrect: true, counted: false });
    const rows = await ctx.db.all('SELECT is_correct, counted FROM recall_attempts ORDER BY id');
    expect(rows).toEqual([{ is_correct: 0, counted: 1 }, { is_correct: 1, counted: 0 }]);
    // the bank's recall % uses only the counted (first) answer
    const bank = (await request(ctx.app).get('/api/student/bank').set(auth(tokA))).body as BankRes;
    expect(bank.words.find((w) => w.wordId === m.wordId)!.recallPct).toBe(0);
  });

  it('rejects unknown items, foreign options, bad bodies and anonymous callers', async () => {
    const m = ((await getToday()).body.items as RecallItem[])[0]!;
    expect((await post([answer(m, 'something else')])).status).toBe(400);
    expect((await post([{ ...answer(m, m.options[0]!), itemId: 'd999-9:meaning' }])).status).toBe(400);
    expect((await post([])).status).toBe(400);
    expect((await post([{ itemId: m.itemId }])).status).toBe(400);
    expect((await request(ctx.app).get('/api/student/recall/today')).status).toBe(401);
    expect((await request(ctx.app).post('/api/student/recall/answers').send({ answers: [] })).status).toBe(401);
  });

  it("will not let a child answer or reuse another child's clientId", async () => {
    const m = ((await getToday()).body.items as RecallItem[])[0]!;
    const a = answer(m, m.options[0]!);
    expect((await post([a])).status).toBe(200);
    // Aarav has no set today, so his answer is refused; the id also belongs to Riya
    expect((await post([a], tokB)).status).toBe(400);
  });
});

describe('My Vocabulary Bank (F6)', () => {
  it("lists only the child's own learned words with meaning, type, own sentence and stars", async () => {
    const a = (await request(ctx.app).get('/api/student/bank').set(auth(tokA))).body as BankRes;
    expect(a.words).toHaveLength(5);
    const w0 = day1.words[0]!;
    const entry = a.words.find((w) => w.wordId === w0.id)!;
    expect(entry).toMatchObject({ word: w0.word, partOfSpeech: w0.partOfSpeech, meaning: w0.meaning, recallPct: null });
    expect(entry.bestSentence).toContain(w0.word);
    expect(entry.stars).toBeGreaterThanOrEqual(0);
    const other = a.words.find((w) => w.wordId === day1.words[1]!.id)!;
    expect(other.bestSentence).toBeNull();

    const b = (await request(ctx.app).get('/api/student/bank').set(auth(tokB))).body as BankRes;
    expect(b.words.map((w) => w.wordId)).toEqual([w0.id]);
    expect(b.words[0]!.bestSentence).toBeNull(); // Riya's sentence never reaches Aarav
    expect((await request(ctx.app).get('/api/student/bank')).status).toBe(401);
  });
});
