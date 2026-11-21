import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StudentProgressRes } from '@shabd/core';
import { auth, finishWords, makeClass, registerTeacher, setup, studentLogin, FAKE_TODAY, type Ctx } from './helpers.ts';

let ctx: Ctx;
beforeEach(async () => { ctx = await setup(); });

const get = (token: string) => request(ctx.app).get('/api/student/progress').set(auth(token));

describe('GET /api/student/progress', () => {
  it('requires a student token', async () => {
    expect((await request(ctx.app).get('/api/student/progress')).status).toBe(401);
    const teacher = await registerTeacher(ctx.app);
    expect((await get(teacher)).status).toBeGreaterThanOrEqual(401);
  });

  it('is a friendly empty state for a brand-new student', async () => {
    const teacher = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya']);
    const r = await get(await studentLogin(ctx.app, cls, students[0]!));
    expect(r.status).toBe(200);
    const b = r.body as StudentProgressRes;
    expect(b.totals).toMatchObject({ daysPlayed: 0, wordsLearned: 0, currentStreak: 0, bestStreak: 0, xp: 0, levelPercent: 0 });
    expect(b.totals.level.level).toBe(0);
    expect(b.days).toHaveLength(14);
    expect(b.days[13]!.date).toBe(FAKE_TODAY);
    expect(b.days.every((d) => !d.played && d.wordsDone === 0 && d.stars === null)).toBe(true);
    expect(b.skills).toEqual([]);
    expect(b.wordsToPractise).toEqual([]);
    expect(b.recentSessions).toEqual([]);
  });

  it('summarises a finished day and lists weak words', async () => {
    const teacher = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya']);
    const token = await studentLogin(ctx.app, cls, students[0]!);
    const sessionId = await finishWords(ctx.app, token);
    // make one word a strong one (100/100)
    const first = (await ctx.db.get<{ word_id: string }>('SELECT word_id FROM word_scores WHERE session_id = ? ORDER BY position LIMIT 1', [sessionId]))!;
    await ctx.db.run('UPDATE word_scores SET spelling = 40, meaning = 20, sentence = 40, total = 100, stars = 3 WHERE session_id = ? AND word_id = ?', [sessionId, first.word_id]);
    expect((await request(ctx.app).post(`/api/student/sessions/${sessionId}/complete`).set(auth(token)).send({})).status).toBe(200);

    const b = (await get(token)).body as StudentProgressRes;
    expect(b.totals.daysPlayed).toBe(1);
    expect(b.totals.wordsLearned).toBe(5);
    expect(b.totals.currentStreak).toBe(1);
    expect(b.totals.bestStreak).toBe(1);
    expect(b.totals.xp).toBeGreaterThan(0);
    const today = b.days[13]!;
    expect(today).toMatchObject({ played: true, wordsDone: 5, stars: 3, percent: 20 });
    expect(b.days[12]!.played).toBe(false);
    const spelling = b.skills.find((s) => s.key === 'spelling')!;
    expect(spelling).toMatchObject({ percent: 20, label: 'Keep practising' });
    expect(b.skills.map((s) => s.key)).toEqual(expect.arrayContaining(['spelling', 'meaning', 'sentence']));
    expect(b.wordsToPractise).toHaveLength(4);
    expect(b.wordsToPractise.map((w) => w.wordId)).not.toContain(first.word_id);
    expect(b.wordsToPractise[0]!.word).toBeTruthy();
    expect(b.recentSessions).toEqual([{ sessionId, date: FAKE_TODAY, wordsDone: 5, stars: 3 }]);
    // never leaks research/assessment fields
    expect(JSON.stringify(b)).not.toMatch(/assessment|marks/i);
  });

  it('only shows the student\'s own data (two students, two classes)', async () => {
    const teacher = await registerTeacher(ctx.app);
    const a = await makeClass(ctx.app, teacher, ['Riya', 'Aarav'], undefined, 'A');
    const b2 = await makeClass(ctx.app, teacher, ['Kabir'], undefined, 'B');
    const tRiya = await studentLogin(ctx.app, a.cls, a.students[0]!);
    const tAarav = await studentLogin(ctx.app, a.cls, a.students[1]!);
    const tKabir = await studentLogin(ctx.app, b2.cls, b2.students[0]!);
    const sid = await finishWords(ctx.app, tRiya);
    await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(tRiya)).send({});

    expect(((await get(tRiya)).body as StudentProgressRes).totals.wordsLearned).toBe(5);
    for (const t of [tAarav, tKabir]) {
      const o = (await get(t)).body as StudentProgressRes;
      expect(o.totals.wordsLearned).toBe(0);
      expect(o.totals.xp).toBe(0);
      expect(o.recentSessions).toEqual([]);
      expect(o.wordsToPractise).toEqual([]);
    }
  });
});
