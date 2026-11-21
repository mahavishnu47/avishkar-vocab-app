import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { AuthenticityRes, ClassRoom, StartAssessmentRes, StudentWithPin } from '@shabd/core';
import { auth, closeTestDb, makeClass, registerTeacher, setup, studentLogin } from './helpers.ts';
import type { DB } from '../src/db/db.ts';
import { authenticitySummary } from '../src/services/research/authenticity.ts';

let app: Express;
let db: DB;
let teacher: string;
let cls: ClassRoom;
let students: StudentWithPin[];
let tokens: string[];

beforeEach(async () => {
  ({ app, db } = await setup());
  teacher = await registerTeacher(app);
  ({ cls, students } = await makeClass(app, teacher, ['Riya', 'Aarav', 'Kabir']));
  tokens = await Promise.all(students.map((s) => studentLogin(app, cls, s)));
});
afterAll(closeTestDb);

interface Today { session: { id: number }; words: { id: string; word: string }[] }
const todayFor = async (i: number) => (await request(app).post('/api/student/sessions/today').set(auth(tokens[i]!)).send({})).body as Today;
let n = 0;
async function sentence(i: number, t: Today, w: number, text: string, extra: Record<string, unknown> = {}) {
  return request(app).post(`/api/student/sessions/${t.session.id}/sentences`).set(auth(tokens[i]!)).send({
    clientId: `c-${Date.now()}-${n++}`, wordId: t.words[w]!.id, submissionNo: 1, text, starterHintUsed: false, msElapsed: 60_000,
    clientTs: new Date().toISOString(), ...extra,
  });
}
const getAuth = async (q = '') => (await request(app).get(`/api/classes/${cls.id}/authenticity${q}`).set(auth(teacher))).body as AuthenticityRes;

describe('keystrokes are stored', () => {
  it('stores keystrokes, deletions and a normalised hash without changing the score', async () => {
    const t = await todayFor(0);
    const w = t.words[0]!.word;
    const text = `My friend is a very ${w} person today`;
    const a = await sentence(0, t, 0, text, { keystrokes: 41, deletions: 3 });
    expect(a.status).toBe(200);
    const b = await sentence(1, await todayFor(1), 0, text);
    expect(b.body.finalMarks).toBe(a.body.finalMarks);
    const row = await db.get<{ keystrokes: number; deletions: number; norm_hash: string }>('SELECT keystrokes, deletions, norm_hash FROM sentence_submissions ORDER BY id LIMIT 1');
    expect(row).toMatchObject({ keystrokes: 41, deletions: 3 });
    expect(row!.norm_hash).toMatch(/^[0-9a-f]{40}$/);
    const none = await db.get<{ keystrokes: number | null }>('SELECT keystrokes FROM sentence_submissions ORDER BY id DESC LIMIT 1');
    expect(none!.keystrokes).toBeNull();
    expect((await sentence(0, t, 1, 'hello', { keystrokes: -1 })).status).toBe(400);
  });
});

describe('peer matches (daily)', () => {
  it('flags the later student only', async () => {
    const t0 = await todayFor(0);
    const t1 = await todayFor(1);
    const w = t0.words[0]!.word;
    await sentence(0, t0, 0, `The farmer was very ${w} in the field`, { keystrokes: 60, deletions: 0 });
    await sentence(1, t1, 0, `The farmer was very ${w} in the field.`, { keystrokes: 60, deletions: 0 });
    const r = await getAuth();
    const flagged = r.items.filter((it) => it.flags.includes('peer_match'));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ firstName: 'Aarav', matchedFirstName: 'Riya', kind: 'daily' });
    expect(r.items.some((it) => it.firstName === 'Riya')).toBe(false);
    expect(r.summary).toMatchObject({ sentences: 2, noFlag: 1, flagged: 1, peerMatches: 1 });
    expect(r.students.find((s) => s.firstName === 'Aarav')).toMatchObject({ sentences: 1, flagged: 1 });
    // date window excludes everything
    expect((await getAuth('?from=2000-01-01&to=2000-01-02')).summary.sentences).toBe(0);
  });
});

describe('templates', () => {
  it('flags the repeated frame once three different words use it', async () => {
    const t = await todayFor(2);
    const frame = (w: string) => `I like ${w} very much`;
    for (let k = 0; k < 2; k++) await sentence(2, t, k, frame(t.words[k]!.word), { keystrokes: 40, deletions: 0 });
    expect((await getAuth()).items.filter((it) => it.flags.includes('template'))).toHaveLength(0);
    await sentence(2, t, 2, frame(t.words[2]!.word), { keystrokes: 40, deletions: 0 });
    const flagged = (await getAuth()).items.filter((it) => it.flags.includes('template'));
    expect(flagged).toHaveLength(3);
  });
});

describe('typing and review', () => {
  it('flags text that did not come from the keyboard and lets the teacher review it', async () => {
    const t = await todayFor(0);
    const w = t.words[0]!.word;
    expect((await sentence(0, t, 0, `Yesterday my teacher was very ${w} to us`, { keystrokes: 4, deletions: 0 })).status).toBe(200);
    const r = await getAuth();
    expect(r.items).toHaveLength(1);
    const it = r.items[0]!;
    expect(it.flags).toContain('typing');
    const url = `/api/classes/${cls.id}/authenticity/daily/${it.id}`;
    expect((await request(app).patch(url).set(auth(teacher)).send({ status: 'not_own' })).status).toBe(200);
    let r2 = await getAuth();
    expect(r2.items[0]!.reviewStatus).toBe('not_own');
    expect(r2.summary.teacherConfirmedCopy).toBe(1);
    expect((await request(app).patch(url).set(auth(teacher)).send({ status: 'ok' })).status).toBe(200);
    r2 = await getAuth();
    expect(r2.summary).toMatchObject({ teacherConfirmedOwn: 1, ownWorkPct: 100, noFlagPct: 0 });
    expect((await request(app).patch(url).set(auth(teacher)).send({ status: null })).status).toBe(200);
    expect((await getAuth()).items[0]!.reviewStatus).toBeNull();
    expect((await request(app).patch(url).set(auth(teacher)).send({ status: 'maybe' })).status).toBe(400);
    expect((await request(app).patch(`/api/classes/${cls.id}/authenticity/other/1`).set(auth(teacher)).send({ status: 'ok' })).status).toBe(400);
    expect((await request(app).patch(`/api/classes/${cls.id}/authenticity/daily/999999`).set(auth(teacher)).send({ status: 'ok' })).status).toBe(404);
  });
});

describe('test window (section C)', () => {
  it('matches peers inside the same window, reviews test answers, and summarises counts', async () => {
    const base = `/api/classes/${cls.id}/assessments`;
    const w = (await request(app).post(base).set(auth(teacher)).send({ kind: 'pre' })).body as { id: number; accessCode: string };
    await request(app).patch(`${base}/${w.id}`).set(auth(teacher)).send({ action: 'open' });
    const text = 'The children sat quietly on the chairs in the big hall.';
    for (const i of [0, 1]) {
      const s = await request(app).post(`/api/student/assessments/${w.id}/start`).set(auth(tokens[i]!)).send({ accessCode: w.accessCode });
      expect(s.status).toBe(200);
      expect((s.body as StartAssessmentRes).items.some((it) => it.id === 'c1')).toBe(true);
      const first = 'c1';
      const put = await request(app).put(`/api/student/assessments/${w.id}/responses`).set(auth(tokens[i]!))
        .send({ items: [{ itemId: first, answer: text, msElapsed: 90_000, keystrokes: 80, deletions: 2 }] });
      expect(put.status).toBe(200);
      if (i === 0) await new Promise((r) => setTimeout(r, 15));
    }
    const r = await getAuth();
    const tests = r.items.filter((it) => it.kind === 'test');
    expect(tests.length).toBeGreaterThanOrEqual(1);
    const hit = tests.find((it) => it.flags.includes('peer_match'))!;
    expect(tests).toHaveLength(1);
    {
      expect(hit.firstName).toBe('Aarav');
      expect(hit.matchedFirstName).toBe('Riya');
      const url = `/api/classes/${cls.id}/authenticity/test/${encodeURIComponent(String(hit.id))}`;
      expect((await request(app).patch(url).set(auth(teacher)).send({ status: 'not_own' })).status).toBe(200);
      expect((await getAuth()).summary.teacherConfirmedCopy).toBe(1);
    }
    const sum = await authenticitySummary(db, [cls.id]);
    expect(sum.sentences).toBeGreaterThanOrEqual(2);
    expect(Object.keys(sum)).not.toContain('items');
  });
});

describe('tenancy', () => {
  it('teachers of other schools and non-teachers get 404/401/403', async () => {
    const other = await registerTeacher(app, 'other@school.in');
    const t = await todayFor(0);
    await sentence(0, t, 0, `The very ${t.words[0]!.word} dog`, { keystrokes: 1 });
    const it = (await getAuth()).items[0]!;
    expect((await request(app).get(`/api/classes/${cls.id}/authenticity`).set(auth(other))).status).toBe(404);
    expect((await request(app).patch(`/api/classes/${cls.id}/authenticity/daily/${it.id}`).set(auth(other)).send({ status: 'ok' })).status).toBe(404);
    expect([401, 403]).toContain((await request(app).get(`/api/classes/${cls.id}/authenticity`).set(auth(tokens[0]!))).status);
    expect((await request(app).get(`/api/classes/${cls.id}/authenticity`)).status).toBe(401);
    // an item of this class is not reachable through another class of the same teacher
    const c2 = await makeClass(app, teacher, ['Zoya'], undefined, 'B');
    expect((await request(app).patch(`/api/classes/${c2.cls.id}/authenticity/daily/${it.id}`).set(auth(teacher)).send({ status: 'ok' })).status).toBe(404);
  });
});
