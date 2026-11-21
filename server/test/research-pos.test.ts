import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TodaySessionRes } from '@shabd/core';
import { auth, makeClass, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';

let ctx: Ctx;
let token: string;
let today: TodaySessionRes;
beforeEach(async () => {
  ctx = await setup();
  const teacher = await registerTeacher(ctx.app);
  const { cls, students } = await makeClass(ctx.app, teacher, ['Riya']);
  token = await studentLogin(ctx.app, cls, students[0]!);
  const r = await request(ctx.app).post('/api/student/sessions/today').set(auth(token)).send({});
  today = r.body;
});

const uuid = () => crypto.randomUUID();
const ts = () => new Date().toISOString();
const post = (sessionId: number, body: unknown, t = token) =>
  request(ctx.app).post(`/api/student/sessions/${sessionId}/attempts`).set(auth(t)).send(body as object);
const tap = (wordId: string, chosen: string, attemptNo: 1 | 2, extra: object = {}) =>
  ({ clientId: uuid(), wordId, attemptNo, chosen, msElapsed: 1234, clientTs: ts(), ...extra });
const rows = () => ctx.db.all('SELECT * FROM word_attempts WHERE stage = \'pos\' ORDER BY attempt_no');

describe('part-of-speech attempts (F3)', () => {
  it('stores a correct first tap with the real elapsed time', async () => {
    const w = today.words[0]!; // kitchen, a noun
    expect(w.partOfSpeech).toBe('noun');
    const r = await post(today.session.id, { pos: [tap(w.id, 'noun', 1)] });
    expect(r.status).toBe(200);
    const [row] = await rows();
    expect(row).toMatchObject({ stage: 'pos', attempt_no: 1, input_text: 'noun', is_correct: 1, primary_error: null, ms_elapsed: 1234 });
  });

  it('ignores a client isCorrect claim and derives it from the word', async () => {
    const w = today.words[0]!;
    const r = await post(today.session.id, { pos: [tap(w.id, 'verb', 1, { isCorrect: true })] });
    expect(r.status).toBe(200);
    expect((await rows())[0]).toMatchObject({ is_correct: 0, primary_error: null });
  });

  it('tags the final row: PS_WRONG_1 when right on the 2nd tap, PS_WRONG_2 when wrong twice', async () => {
    const a = today.words[0]!;
    const b = today.words[1]!; // wash, a verb
    expect(b.partOfSpeech).toBe('verb');
    await post(today.session.id, { pos: [tap(a.id, 'verb', 1), tap(a.id, 'noun', 2)] });
    await post(today.session.id, { pos: [tap(b.id, 'noun', 1), tap(b.id, 'adverb', 2)] });
    const all = await ctx.db.all("SELECT word_id, attempt_no, is_correct, primary_error FROM word_attempts WHERE stage = 'pos' ORDER BY id");
    expect(all).toEqual([
      { word_id: a.id, attempt_no: 1, is_correct: 0, primary_error: null },
      { word_id: a.id, attempt_no: 2, is_correct: 1, primary_error: 'PS_WRONG_1' },
      { word_id: b.id, attempt_no: 1, is_correct: 0, primary_error: null },
      { word_id: b.id, attempt_no: 2, is_correct: 0, primary_error: 'PS_WRONG_2' },
    ]);
  });

  it('rejects options outside the four word types, bad attempt numbers and foreign words', async () => {
    const w = today.words[0]!;
    expect((await post(today.session.id, { pos: [tap(w.id, 'preposition', 1)] })).status).toBe(400);
    expect((await post(today.session.id, { pos: [tap(w.id, 'Noun', 1)] })).status).toBe(400);
    expect((await post(today.session.id, { pos: [tap(w.id, 'noun', 3 as 1)] })).status).toBe(400);
    expect((await post(today.session.id, { pos: [tap('d999-9', 'noun', 1)] })).status).toBe(400);
    expect((await post(today.session.id, { pos: 'noun' })).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it('is idempotent when the same clientId is resent', async () => {
    const w = today.words[0]!;
    const t = tap(w.id, 'noun', 1);
    const one = await post(today.session.id, { pos: [t] });
    const two = await post(today.session.id, { pos: [t] });
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(two.body.accepted).toEqual([t.clientId]);
    expect(await rows()).toHaveLength(1);
  });

  it('refuses a clientId already used by another session', async () => {
    const w = today.words[0]!;
    const t = tap(w.id, 'noun', 1);
    await post(today.session.id, { pos: [t] });
    const teacher2 = await registerTeacher(ctx.app, 'other@school.in');
    const c2 = await makeClass(ctx.app, teacher2, ['Sai']);
    const token2 = await studentLogin(ctx.app, c2.cls, c2.students[0]!);
    const s2 = (await request(ctx.app).post('/api/student/sessions/today').set(auth(token2)).send({})).body as TodaySessionRes;
    expect((await post(s2.session.id, { pos: [{ ...t }] }, token2)).status).toBe(409);
  });

  it('old clients (spell + meaning only) still complete the word, and POS does not change the score', async () => {
    const w = today.words[0]!;
    const base = {
      spell: [{ clientId: uuid(), wordId: w.id, attemptNo: 1, input: w.word, hints: [], audioPlays: 0, msElapsed: 1, clientTs: ts() }],
      meaning: [{ clientId: uuid(), wordId: w.id, attemptNo: 1, chosen: w.meaning, isCorrect: true, msElapsed: 0, clientTs: ts() }],
    };
    expect((await post(today.session.id, base)).status).toBe(200);
    const sent = await request(ctx.app).post(`/api/student/sessions/${today.session.id}/sentences`).set(auth(token)).send({
      clientId: uuid(), wordId: w.id, submissionNo: 1, text: `I like the ${w.word} in my house because it is nice.`,
      starterHintUsed: false, msElapsed: 1000, clientTs: ts(),
    });
    expect(sent.status).toBe(200);
    const without = await request(ctx.app).post(`/api/student/sessions/${today.session.id}/words/${w.id}/complete`).set(auth(token)).send({});
    expect(without.status).toBe(200);

    // The same word played by a new-style client (with POS taps) scores identically.
    const w2 = today.words[1]!;
    const withPos = {
      spell: [{ clientId: uuid(), wordId: w2.id, attemptNo: 1, input: w2.word, hints: [], audioPlays: 0, msElapsed: 1, clientTs: ts() }],
      meaning: [{ clientId: uuid(), wordId: w2.id, attemptNo: 1, chosen: w2.meaning, isCorrect: true, msElapsed: 0, clientTs: ts() }],
      pos: [tap(w2.id, 'adjective', 1), tap(w2.id, 'noun', 2)],
    };
    expect((await post(today.session.id, withPos)).status).toBe(200);
    await request(ctx.app).post(`/api/student/sessions/${today.session.id}/sentences`).set(auth(token)).send({
      clientId: uuid(), wordId: w2.id, submissionNo: 1, text: `I like the ${w2.word} in my house because it is nice.`,
      starterHintUsed: false, msElapsed: 1000, clientTs: ts(),
    });
    const done2 = await request(ctx.app).post(`/api/student/sessions/${today.session.id}/words/${w2.id}/complete`).set(auth(token)).send({});
    expect(done2.status).toBe(200);
    expect(done2.body.spelling).toBe(without.body.spelling);
    expect(done2.body.meaning).toBe(without.body.meaning);
  });
});
