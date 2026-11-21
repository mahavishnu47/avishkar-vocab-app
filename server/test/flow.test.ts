import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { levelFor, type AttemptsRes, type SentenceRes, type SessionSummaryRes, type TodaySessionRes, type Word } from '@shabd/core';
import { auth, makeClass, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';

let ctx: Ctx;
let teacher: string;
beforeEach(async () => {
  ctx = await setup();
  teacher = await registerTeacher(ctx.app);
});

const uuid = () => crypto.randomUUID();
const ts = () => new Date().toISOString();
const count = async (table: string) => (await ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;

async function start(token: string): Promise<TodaySessionRes> {
  const r = await request(ctx.app).post('/api/student/sessions/today').set(auth(token)).send({});
  expect(r.status).toBe(200);
  return r.body;
}

/** wrong spelling (drop last letter), correct on 2nd; wrong meaning, then right; one sentence. Returns the client ids used. */
async function playWord(token: string, sessionId: number, w: Word, opts: { hints?: string[]; sentence?: string; submissionNo?: 1 | 2 } = {}) {
  const base = `/api/student/sessions/${sessionId}`;
  const ids = { s1: uuid(), s2: uuid(), m1: uuid(), m2: uuid(), sent: uuid() };
  const att = await request(ctx.app).post(`${base}/attempts`).set(auth(token)).send({
    spell: [
      { clientId: ids.s1, wordId: w.id, attemptNo: 1, input: w.word.slice(0, -1), hints: [], audioPlays: 1, msElapsed: 5000, clientTs: ts() },
      { clientId: ids.s2, wordId: w.id, attemptNo: 2, input: ` ${w.word.toUpperCase()} `, hints: opts.hints ?? [], audioPlays: 2, msElapsed: 4000, clientTs: ts() },
    ],
    meaning: [
      { clientId: ids.m1, wordId: w.id, attemptNo: 1, chosen: w.distractorMeanings[0], isCorrect: false, msElapsed: 2000, clientTs: ts() },
      { clientId: ids.m2, wordId: w.id, attemptNo: 2, chosen: w.meaning, isCorrect: true, msElapsed: 2000, clientTs: ts() },
    ],
  });
  expect(att.status).toBe(200);
  const sent = await request(ctx.app).post(`${base}/sentences`).set(auth(token)).send({
    clientId: ids.sent, wordId: w.id, submissionNo: opts.submissionNo ?? 1, text: opts.sentence ?? `I like the ${w.word} in my house because it is nice.`,
    starterHintUsed: false, msElapsed: 30000, clientTs: ts(),
  });
  expect(sent.status).toBe(200);
  const done = await request(ctx.app).post(`${base}/words/${w.id}/complete`).set(auth(token)).send({});
  expect(done.status).toBe(200);
  return { ids, att: att.body as AttemptsRes, sent: sent.body as SentenceRes, score: done.body };
}

describe('full student flow', () => {
  it('today -> attempts -> sentences -> complete words -> complete session -> home/leaderboard/dashboard/analytics/detail', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya', 'Aarav', 'Kabir']);
    const riya = await studentLogin(ctx.app, cls, students[0]!);

    const home0 = await request(ctx.app).get('/api/student/home').set(auth(riya));
    expect(home0.body).toMatchObject({
      className: '5A', leaderboardMode: 'individual', streak: 0, bestStreak: 0, xpTotal: 0, xpWeek: 0,
      today: { date: '2026-11-20', dayIndex: 1, status: 'not_started', wordsDone: 0, sessionId: null },
      level: { level: 0 },
    });

    const today = await start(riya);
    expect(today.words.map((w) => w.word)).toEqual(['kitchen', 'wash', 'happy', 'table', 'warm']);
    expect(today.session).toMatchObject({ date: '2026-11-20', dayIndex: 1, completedAt: null });
    expect(today.progress).toEqual({ completedWordIds: [], wordScores: [] });
    expect((await start(riya)).session.id).toBe(today.session.id); // same session returned
    expect(await count('sessions')).toBe(1);

    const sid = today.session.id;
    const first = await playWord(riya, sid, today.words[0]!, { hints: ['first_letter'] });
    // server re-derived correctness and classified the wrong spelling
    const cls1 = first.att.classifications[first.ids.s1]!;
    expect(cls1.isCorrect).toBe(false);
    expect(cls1.tags.length).toBeGreaterThan(0);
    expect(cls1.tags).toContain(cls1.primary);
    expect(first.att.classifications[first.ids.s2]).toMatchObject({ isCorrect: true, primary: 'SP_CORRECT' });
    expect(first.att.accepted.sort()).toEqual([first.ids.s1, first.ids.s2, first.ids.m1, first.ids.m2].sort());
    expect(first.sent.counted).toBe(true);
    expect(first.sent.evaluation.gate).toBe('ok');
    expect(first.sent.evaluation.evaluator).toBe('rules-1');
    expect(first.sent.finalMarks).toBe(first.sent.evaluation.rawTotal);
    expect(first.score).toMatchObject({ wordId: 'd001-1', spelling: 18, meaning: 8, sentence: first.sent.finalMarks }); // 24 - 6 hint
    expect(first.score.total).toBe(18 + 8 + first.sent.finalMarks!);

    const mid = await request(ctx.app).get('/api/student/home').set(auth(riya));
    expect(mid.body.today).toMatchObject({ status: 'in_progress', wordsDone: 1, sessionId: sid });
    expect((await start(riya)).progress.completedWordIds).toEqual(['d001-1']);

    for (const w of today.words.slice(1)) {
      const r = await playWord(riya, sid, w);
      expect(r.score).toMatchObject({ spelling: 24, meaning: 8 });
    }

    const summary = await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(riya)).send({});
    expect(summary.status).toBe(200);
    const s: SessionSummaryRes = summary.body;
    expect(s.wordScores).toHaveLength(5);
    expect(s.totalMarks).toBe(s.wordScores.reduce((n, w) => n + w.total, 0));
    expect(s.xp).toMatchObject({ wordMarks: s.totalMarks, completionBonus: 25, streakBonus: 5 });
    expect(s.xp.total).toBe(s.xp.wordMarks + 25 + 5 + s.xp.perfectBonus);
    expect(s.streak).toEqual({ current: 1, best: 1, lastCompletedDate: '2026-11-20' });
    expect(s.xpTotal).toBe(s.xp.total);
    expect(s.level).toEqual(levelFor(s.xpTotal));

    // idempotent completion: same summary, no extra ledger rows
    const ledger = await count('xp_ledger');
    const again = await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(riya)).send({});
    expect(again.body).toEqual(s);
    expect(await count('xp_ledger')).toBe(ledger);
    expect((await request(ctx.app).post(`/api/student/sessions/${sid}/words/${today.words[0]!.id}/complete`).set(auth(riya)).send({})).body.total).toBe(first.score.total);

    const home = await request(ctx.app).get('/api/student/home').set(auth(riya));
    expect(home.body).toMatchObject({ streak: 1, bestStreak: 1, xpTotal: s.xp.total, xpWeek: s.xp.total, today: { status: 'completed', wordsDone: 5 } });

    // student leaderboard: top 10 + me; aarav/kabir have 0 xp
    const lb = await request(ctx.app).get('/api/student/leaderboard').set(auth(riya));
    expect(lb.body).toMatchObject({ period: 'week', weekStart: '2026-11-16', mode: 'individual' });
    expect(lb.body.entries.map((e: { firstName: string; rank: number }) => [e.firstName, e.rank])).toEqual([['Riya', 1], ['Aarav', 2], ['Kabir', 2]]);
    expect(lb.body.entries[0].isMe).toBe(true);
    expect(lb.body.me).toMatchObject({ firstName: 'Riya', rank: 1, xp: s.xp.total });

    // teacher views
    const dash = await request(ctx.app).get(`/api/classes/${cls.id}/dashboard`).set(auth(teacher));
    expect(dash.status).toBe(200);
    expect(dash.body).toMatchObject({ date: '2026-11-20', dayIndex: 1, completedCount: 1 });
    expect(dash.body.set.words).toHaveLength(5);
    expect(dash.body.students[0]).toMatchObject({ firstName: 'Riya', status: 'completed', wordsDone: 5, totalMarks: s.totalMarks, streak: 1, xpWeek: s.xp.total });
    expect(dash.body.students[1]).toMatchObject({ firstName: 'Aarav', status: 'not_started', wordsDone: 0, totalMarks: null });

    const tlb = await request(ctx.app).get(`/api/classes/${cls.id}/leaderboard?period=all`).set(auth(teacher));
    expect(tlb.body.period).toBe('all');
    expect(tlb.body.entries).toHaveLength(3);
    expect(tlb.body.me).toBeUndefined();
    expect((await request(ctx.app).get(`/api/classes/${cls.id}/leaderboard?period=month`).set(auth(teacher))).status).toBe(400);

    const an = await request(ctx.app).get(`/api/classes/${cls.id}/analytics`).set(auth(teacher));
    expect(an.status).toBe(200);
    expect(an.body.to).toBe('2026-11-20');
    expect(an.body.from).toBe('2026-10-24');
    const p = an.body.students.find((x: { firstName: string }) => x.firstName === 'Riya');
    expect(p).toMatchObject({ sessionsCompleted: 1, spellingWords: 5, spellingStrength: 0 }); // never right on attempt 1
    expect(p.sentenceStrength).toBeGreaterThan(0);
    expect(p.rubricAverages).toMatchObject({ use: expect.any(Number) });
    expect(Object.values(p.spellingErrorCounts).reduce((a: number, b) => a + (b as number), 0)).toBe(5); // one wrong attempt per word
    expect(p.weaknessLabels).toEqual([]);
    expect(an.body.students.find((x: { firstName: string }) => x.firstName === 'Aarav')).toMatchObject({ spellingStrength: null, sentenceStrength: null, rubricAverages: null });
    expect(an.body.hardestWords).toEqual([]); // fewer than 3 students attempted
    const narrow = await request(ctx.app).get(`/api/classes/${cls.id}/analytics?from=2026-11-21&to=2026-11-25`).set(auth(teacher));
    expect(narrow.body.students[0].sessionsCompleted).toBe(0);
    expect((await request(ctx.app).get(`/api/classes/${cls.id}/analytics?from=2026-12-01&to=2026-11-01`).set(auth(teacher))).status).toBe(400);

    const detail = await request(ctx.app).get(`/api/students/${students[0]!.id}/analytics`).set(auth(teacher));
    expect(detail.status).toBe(200);
    expect(detail.body.student).toMatchObject({ firstName: 'Riya', pin: students[0]!.pin });
    expect(detail.body.sessions).toHaveLength(1);
    expect(detail.body.sessions[0]).toEqual(s);
    expect(detail.body.spellingErrors).toHaveLength(5);
    expect(detail.body.spellingErrors[0]).toMatchObject({ date: '2026-11-20', attemptNo: 1 });
    expect(detail.body.sentences).toHaveLength(5);
    expect(detail.body.sentences[0]).toMatchObject({ evaluator: 'rules-1', submissionNo: 1 });
    expect(detail.body.profile.studentId).toBe(students[0]!.id);
  });

  it('is idempotent for re-posted attempts, sentences and completions', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya']);
    const tok = await studentLogin(ctx.app, cls, students[0]!);
    const today = await start(tok);
    const sid = today.session.id;
    const w = today.words[0]!;
    const body = {
      spell: [{ clientId: uuid(), wordId: w.id, attemptNo: 1, input: 'kitchn', hints: [], audioPlays: 0, msElapsed: 1, clientTs: ts() }],
      meaning: [{ clientId: uuid(), wordId: w.id, attemptNo: 1, chosen: w.meaning, isCorrect: true, msElapsed: 1, clientTs: ts() }],
    };
    const r1 = await request(ctx.app).post(`/api/student/sessions/${sid}/attempts`).set(auth(tok)).send(body);
    const r2 = await request(ctx.app).post(`/api/student/sessions/${sid}/attempts`).set(auth(tok)).send(body);
    expect(r2.body).toEqual(r1.body);
    expect(await count('word_attempts')).toBe(2);

    const sb = { clientId: uuid(), wordId: w.id, submissionNo: 1, text: 'The kitchen is a big room.', starterHintUsed: true, msElapsed: 1, clientTs: ts() };
    const a = await request(ctx.app).post(`/api/student/sessions/${sid}/sentences`).set(auth(tok)).send(sb);
    const b = await request(ctx.app).post(`/api/student/sessions/${sid}/sentences`).set(auth(tok)).send(sb);
    expect(b.body).toEqual(a.body);
    expect(await count('sentence_submissions')).toBe(1);
    expect(a.body.finalMarks).toBe(Math.max(0, a.body.evaluation.rawTotal - 5)); // starter hint costs 5

    const c1 = await request(ctx.app).post(`/api/student/sessions/${sid}/words/${w.id}/complete`).set(auth(tok)).send({});
    const c2 = await request(ctx.app).post(`/api/student/sessions/${sid}/words/${w.id}/complete`).set(auth(tok)).send({});
    expect(c2.body).toEqual(c1.body);
    expect(await count('word_scores')).toBe(1);
    expect(c1.body).toMatchObject({ spelling: 0, meaning: 20 }); // wrong spelling only once; meaning right first time

    const s1 = await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(tok)).send({});
    const s2 = await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(tok)).send({});
    expect(s2.body).toEqual(s1.body);
    expect(s1.body.wordScores).toHaveLength(5); // unfinished words are scored from whatever is stored (0)
    expect(s1.body.xp.total).toBe(s2.body.xp.total);
    expect(await count('xp_ledger')).toBe(4);
  });

  it('limits counted sentences to 2, applies the 0.8 multiplier, and does not count gated ones', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya']);
    const tok = await startToken(cls, students);
    const today = await start(tok);
    const sid = today.session.id;
    const w = today.words[0]!;
    const post = (text: string, no: 1 | 2 = 1, extra: object = {}) =>
      request(ctx.app).post(`/api/student/sessions/${sid}/sentences`).set(auth(tok))
        .send({ clientId: uuid(), wordId: w.id, submissionNo: no, text, starterHintUsed: false, msElapsed: 1, clientTs: ts(), ...extra });

    const empty = await post('');
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ counted: false, finalMarks: null, evaluation: { gate: 'empty' } });
    const missing = await post('I am happy today.');
    expect(missing.body).toMatchObject({ counted: false, finalMarks: null, evaluation: { gate: 'word_missing' } });
    const dev = await post('माझे स्वयंपाकघर kitchen');
    expect(dev.body.evaluation.gate).toBe('devanagari');
    expect(await count('sentence_submissions')).toBe(3); // gated rows are still stored for analytics

    const one = await post('The kitchen in our house is big and clean.');
    expect(one.body.counted).toBe(true);
    const two = await post('Aai cooks tasty food in the kitchen every morning.', 2);
    expect(two.body.counted).toBe(true);
    expect(two.body.finalMarks).toBe(Math.max(0, Math.round(two.body.evaluation.rawTotal * 0.8)));
    const three = await post('My kitchen has a window and a table.', 2);
    expect(three.status).toBe(409);
    expect(three.body.error.code).toBe('conflict');
    // a gated third attempt is still fine
    expect((await post('')).status).toBe(200);

    const score = await request(ctx.app).post(`/api/student/sessions/${sid}/words/${w.id}/complete`).set(auth(tok)).send({});
    expect(score.body.sentence).toBe(Math.max(one.body.finalMarks, two.body.finalMarks)); // best of the two
  });

  it('rejects bad input and foreign sessions', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya', 'Aarav']);
    const a = await studentLogin(ctx.app, cls, students[0]!);
    const b = await studentLogin(ctx.app, cls, students[1]!);
    const today = await start(a);
    const sid = today.session.id;
    const w = today.words[0]!;
    const att = (token: string, body: unknown, id = sid) => request(ctx.app).post(`/api/student/sessions/${id}/attempts`).set(auth(token)).send(body as object);
    const spell = (over: object = {}) => ({ spell: [{ clientId: uuid(), wordId: w.id, attemptNo: 1, input: 'x', hints: [], audioPlays: 0, msElapsed: 1, clientTs: ts(), ...over }] });

    expect((await att(b, spell())).status).toBe(404); // someone else's session
    expect((await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(b)).send({})).status).toBe(404);
    expect((await request(ctx.app).post(`/api/student/sessions/9999/complete`).set(auth(a)).send({})).status).toBe(404);
    expect((await request(ctx.app).post(`/api/student/sessions/abc/complete`).set(auth(a)).send({})).status).toBe(404);
    expect((await att(a, spell({ wordId: 'd009-1' }))).status).toBe(400); // not in the snapshot
    expect((await att(a, spell({ attemptNo: 4 }))).status).toBe(400);
    expect((await att(a, spell({ clientId: undefined }))).status).toBe(400);
    expect((await att(a, { meaning: [{ clientId: uuid(), wordId: w.id, attemptNo: 3, chosen: w.meaning, isCorrect: true, msElapsed: 1, clientTs: ts() }] })).status).toBe(400);
    expect((await att(a, { meaning: [{ clientId: uuid(), wordId: w.id, attemptNo: 1, chosen: 'not an option', isCorrect: true, msElapsed: 1, clientTs: ts() }] })).status).toBe(400);
    expect((await request(ctx.app).post(`/api/student/sessions/${sid}/words/d009-1/complete`).set(auth(a)).send({})).status).toBe(400);
    expect(await count('word_attempts')).toBe(0);
    // the client cannot claim a correct spelling
    const r = await att(a, spell({ input: 'wrongword', isCorrect: true }));
    expect(Object.values(r.body.classifications as Record<string, { isCorrect: boolean }>)[0]!.isCorrect).toBe(false);
    // meaning primary_error on the final attempt row
    await att(a, { meaning: [
      { clientId: 'm-1', wordId: w.id, attemptNo: 1, chosen: w.distractorMeanings[0], isCorrect: false, msElapsed: 1, clientTs: ts() },
      { clientId: 'm-2', wordId: w.id, attemptNo: 2, chosen: w.distractorMeanings[1], isCorrect: false, msElapsed: 1, clientTs: ts() },
    ] });
    expect(((await ctx.db.get<{ primary_error: string }>("SELECT primary_error FROM word_attempts WHERE client_id = 'm-2'"))!).primary_error).toBe('MN_WRONG_2');
  });

  it('keeps a session snapshot after the teacher overrides words, and tracks streaks across days', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya']);
    const tok = await studentLogin(ctx.app, cls, students[0]!);
    const before = await start(tok);
    await request(ctx.app).put(`/api/classes/${cls.id}/daily-words/2026-11-20`).set(auth(teacher))
      .send({ wordIds: ['d005-1', 'd005-2', 'd005-3', 'd005-4', 'd005-5'] });
    expect((await start(tok)).words.map((w) => w.id)).toEqual(before.words.map((w) => w.id)); // snapshot wins

    const finish = async () => {
      const t = await start(tok);
      return request(ctx.app).post(`/api/student/sessions/${t.session.id}/complete`).set(auth(tok)).send({});
    };
    expect((await finish()).body.streak.current).toBe(1);
    process.env.FAKE_TODAY = '2026-11-21';
    const home = await request(ctx.app).get('/api/student/home').set(auth(tok));
    expect(home.body).toMatchObject({ streak: 1, today: { date: '2026-11-21', dayIndex: 2, status: 'not_started' } });
    const d2 = await finish();
    expect(d2.body.streak).toEqual({ current: 2, best: 2, lastCompletedDate: '2026-11-21' });
    expect(d2.body.xp.streakBonus).toBe(10);
    process.env.FAKE_TODAY = '2026-11-24'; // missed two days
    expect((await request(ctx.app).get('/api/student/home').set(auth(tok))).body).toMatchObject({ streak: 0, bestStreak: 2 });
    expect((await finish()).body.streak).toEqual({ current: 1, best: 2, lastCompletedDate: '2026-11-24' });
    // week boundary: 2026-11-24 is in the week of 2026-11-23, the earlier days are in the week of 2026-11-16
    const wk = await request(ctx.app).get('/api/student/home').set(auth(tok));
    expect(wk.body.xpWeek).toBeLessThan(wk.body.xpTotal);
  });

  it('completing the same session concurrently never duplicates XP ledger rows', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya']);
    const tok = await studentLogin(ctx.app, cls, students[0]!);
    const today = await start(tok);
    const sid = today.session.id;
    for (const w of today.words.slice(0, 2)) await playWord(tok, sid, w);
    const results = await Promise.all(
      [1, 2, 3].map(() => request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(tok)).send({})),
    );
    for (const r of results) expect(r.status).toBe(200);
    expect(results[1]!.body).toEqual(results[0]!.body);
    expect(results[2]!.body).toEqual(results[0]!.body);
    expect(await count('xp_ledger')).toBe(4);
    const sum = await ctx.db.get<{ n: number }>('SELECT COALESCE(SUM(amount), 0) AS n FROM xp_ledger WHERE student_id = ?', [students[0]!.id]);
    expect(sum!.n).toBe(results[0]!.body.xp.total);
    expect(results[0]!.body.xpTotal).toBe(results[0]!.body.xp.total);
  });

  it('hides the student leaderboard when the teacher switches it off', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya', 'Aarav']);
    const tok = await studentLogin(ctx.app, cls, students[0]!);
    await request(ctx.app).patch(`/api/classes/${cls.id}`).set(auth(teacher)).send({ leaderboardMode: 'hidden' });
    const lb = await request(ctx.app).get('/api/student/leaderboard').set(auth(tok));
    expect(lb.body).toMatchObject({ mode: 'hidden', entries: [] });
    expect(lb.body.me).toBeUndefined();
    expect((await request(ctx.app).get(`/api/classes/${cls.id}/leaderboard`).set(auth(teacher))).body.entries).toHaveLength(2);
  });
});

async function startToken(cls: Parameters<typeof studentLogin>[1], students: Parameters<typeof studentLogin>[2][]) {
  return studentLogin(ctx.app, cls, students[0]!);
}
