/**
 * Tenant isolation matrix (docs/ONBOARDING_SPEC.md 4.8): 2 schools x (admin, teacher), plus a second teacher in the same school.
 * Everything outside the caller's scope is a 404 (never 403); school-admin gates are 401/403.
 */
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ClassRoom, StudentWithPin } from '@shabd/core';
import { adminAuth, auth, makeClass, makeSchool, registerTeacher, setup, studentLogin, type Ctx, type TestSchool } from './helpers.ts';

let ctx: Ctx;
let A: TestSchool;
let B: TestSchool;
let tA: string; // owner of the class in school A
let tA2: string; // another plain teacher in school A
let tB: string; // teacher in school B
let cls: ClassRoom;
let students: StudentWithPin[];
let tAId: number;

let tBId: number;
let inviteA: number;
let customWord: string;

beforeAll(async () => {
  ctx = await setup();
  A = await makeSchool(ctx.app, 'School A');
  B = await makeSchool(ctx.app, 'School B');
  tA = await registerTeacher(ctx.app, 'ta@x.in', A);
  tA2 = await registerTeacher(ctx.app, 'ta2@x.in', A);
  tB = await registerTeacher(ctx.app, 'tb@x.in', B);
  ({ cls, students } = await makeClass(ctx.app, tA));
  const id = async (t: string) => (await request(ctx.app).get('/api/auth/me').set(auth(t))).body.teacher.id as number;
  [tAId, tBId] = [await id(tA), await id(tB)];
  inviteA = (await request(ctx.app).get('/api/school/invites').set(auth(A.adminToken))).body[0].id;
  const w = await request(ctx.app).post('/api/words').set(auth(tA)).send({
    word: 'zephyr', partOfSpeech: 'noun', difficulty: 2, meaning: 'a soft gentle breeze', exampleSentence: 'A zephyr cooled the room.',
    distractorMeanings: ['a loud noisy storm', 'a small hard stone'], contextWords: ['wind', 'air', 'soft'],
  });
  expect(w.status).toBe(201);
  customWord = w.body.id;
});

type Call = [method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: () => string, body?: object];
const classCalls = (): Call[] => [
  ['get', () => `/api/classes/${cls.id}/students`],
  ['post', () => `/api/classes/${cls.id}/students`, { students: [{ rollNo: 50, firstName: 'Zed' }] }],
  ['patch', () => `/api/classes/${cls.id}`, { name: 'Hacked' }],
  ['post', () => `/api/classes/${cls.id}/rotate-code`],
  ['get', () => `/api/classes/${cls.id}/share`],
  ['get', () => `/api/classes/${cls.id}/dashboard`],
  ['get', () => `/api/classes/${cls.id}/leaderboard`],
  ['get', () => `/api/classes/${cls.id}/analytics`],
  ['get', () => `/api/classes/${cls.id}/export.csv?type=students`],
  ['get', () => `/api/classes/${cls.id}/daily-words`],
  ['put', () => `/api/classes/${cls.id}/daily-words/2026-11-21`, { wordIds: ['d001-1', 'd001-2', 'd001-3', 'd001-4', 'd001-5'] }],
  ['delete', () => `/api/classes/${cls.id}/daily-words/2026-11-21`],
  ['patch', () => `/api/students/${students[0]!.id}`, { firstName: 'Hacked' }],
  ['post', () => `/api/students/${students[0]!.id}/reset-pin`],
  ['get', () => `/api/students/${students[0]!.id}/analytics`],
  ['patch', () => `/api/school/classes/${cls.id}`, { archived: true }], // admin route, school id comes from the token
];

const run = (t: string, [m, p, b]: Call) => request(ctx.app)[m](p()).set(auth(t)).send(b ?? undefined);

describe('class and student endpoints', () => {
  it.each([
    ['school B admin', () => B.adminToken],
    ['school B teacher', () => tB],
    ['another plain teacher of the same school', () => tA2],
  ])('%s gets 404 on every class/student endpoint of someone else', async (_n, tok) => {
    for (const call of classCalls()) {
      if (call[1]().startsWith('/api/school/') && tok() !== B.adminToken) continue; // plain teachers fail the admin gate first (403, below)
      const r = await run(tok(), call);
      expect(r.status, `${call[0]} ${call[1]()} -> ${r.status}`).toBe(404);
    }
    // nothing changed
    const row = await ctx.db.get<{ name: string; archived: number }>('SELECT name, archived FROM classes WHERE id = ?', [cls.id]);
    expect(row).toEqual({ name: '5A', archived: 0 });
    expect((await ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM students WHERE class_id = ?', [cls.id]))!.n).toBe(3);
  });

  it('the owner and the school admin pass the same calls', async () => {
    for (const tok of [tA, A.adminToken]) {
      for (const call of classCalls().slice(0, 12)) {
        if (call[0] !== 'get') continue;
        const r = await run(tok, call);
        expect(r.status, `${call[0]} ${call[1]()} as owner/admin -> ${r.status}`).toBe(200);
      }
    }
  });

  it('a plain teacher is never given 403 for classes, and /classes lists only their own', async () => {
    expect((await request(ctx.app).get('/api/classes').set(auth(tA2))).body).toEqual([]);
    expect((await request(ctx.app).get('/api/classes').set(auth(tB))).body).toEqual([]);
    expect((await request(ctx.app).get('/api/classes').set(auth(tA))).body).toHaveLength(1);
    // ids that do not exist look the same as ids in other schools
    const ghost = await request(ctx.app).get('/api/classes/99999/students').set(auth(tA));
    const foreign = await request(ctx.app).get(`/api/classes/${cls.id}/students`).set(auth(tB));
    expect(ghost.status).toBe(foreign.status);
    expect(ghost.body.error.message).toBe(foreign.body.error.message);
  });

  it('no token is 401; a student token never reaches staff routes', async () => {
    for (const call of classCalls()) {
      const r = await request(ctx.app)[call[0]](call[1]()).send(call[2] ?? undefined);
      expect(r.status).toBe(401);
    }
    const st = await studentLogin(ctx.app, cls, students[0]!);
    expect((await request(ctx.app).get(`/api/classes/${cls.id}/students`).set(auth(st))).status).toBe(401);
    expect((await request(ctx.app).get('/api/school').set(auth(st))).status).toBe(401);
    expect((await request(ctx.app).get('/api/teacher/overview').set(auth(st))).status).toBe(401);
  });
});

describe('school admin endpoints', () => {
  const adminCalls = (): Call[] => [
    ['get', () => '/api/school'],
    ['patch', () => '/api/school', { name: 'Hacked' }],
    ['post', () => '/api/school/rotate-student-code'],
    ['get', () => '/api/school/overview'],
    ['get', () => '/api/school/teachers'],
    ['patch', () => `/api/school/teachers/${tAId}`, { active: false }],
    ['post', () => `/api/school/teachers/${tAId}/reset-link`],
    ['get', () => '/api/school/invites'],
    ['post', () => '/api/school/invites'],
    ['delete', () => `/api/school/invites/${inviteA}`],
    ['get', () => '/api/school/classes'],
    ['patch', () => `/api/school/classes/${cls.id}`, { archived: true }],
    ['get', () => '/api/school/audit'],
  ];

  it('plain teachers get 403, anonymous 401', async () => {
    for (const call of adminCalls()) {
      const r = await run(tA, call);
      expect(r.status, `${call[0]} ${call[1]()}`).toBe(403);
      expect((await request(ctx.app)[call[0]](call[1]())).status).toBe(401);
    }
  });

  it("another school's admin gets 404 on foreign ids and sees only their own data on list endpoints", async () => {
    for (const call of adminCalls().filter((c) => /teachers\/|invites\/|classes\//.test(c[1]()))) {
      const r = await run(B.adminToken, call);
      expect(r.status, `${call[0]} ${call[1]()}`).toBe(404);
    }
    const teachers = (await request(ctx.app).get('/api/school/teachers').set(auth(B.adminToken))).body;
    expect(teachers.map((t: { email: string }) => t.email).sort()).toEqual([B.adminEmail, 'tb@x.in'].sort());
    const ov = (await request(ctx.app).get('/api/school/overview').set(auth(B.adminToken))).body;
    expect(ov.classes).toEqual([]);
    expect(ov.totals).toMatchObject({ classes: 0, students: 0 });
    expect((await request(ctx.app).get('/api/school/classes').set(auth(B.adminToken))).body).toEqual([]);
    const info = (await request(ctx.app).get('/api/school').set(auth(B.adminToken))).body;
    expect(info.school.name).toBe('School B');
    expect(info.teacherInvite.id).not.toBe(inviteA);
    const audit = (await request(ctx.app).get('/api/school/audit?limit=200').set(auth(B.adminToken))).body;
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain('School A');
    // nothing of A was touched
    expect((await ctx.db.get<{ active: number }>('SELECT active FROM teachers WHERE id = ?', [tAId]))!.active).toBe(1);
    expect((await ctx.db.get<{ revoked_at: string | null }>('SELECT revoked_at FROM invites WHERE id = ?', [inviteA]))!.revoked_at).toBeNull();
  });

  it('cannot reassign a class to a teacher of another school, nor take a foreign teacher id', async () => {
    const r = await request(ctx.app).patch(`/api/school/classes/${cls.id}`).set(auth(A.adminToken)).send({ teacherId: tBId });
    expect(r.status).toBe(400);
    expect((await ctx.db.get<{ teacher_id: number }>('SELECT teacher_id FROM classes WHERE id = ?', [cls.id]))!.teacher_id).toBe(tAId);
    expect((await request(ctx.app).patch(`/api/school/teachers/${tBId}`).set(auth(A.adminToken)).send({ role: 'school_admin' })).status).toBe(404);
    expect((await request(ctx.app).post(`/api/school/teachers/${tBId}/reset-link`).set(auth(A.adminToken))).status).toBe(404);
  });

  it('super admin routes ignore staff tokens entirely', async () => {
    for (const tok of [A.adminToken, tA, tB]) {
      expect((await request(ctx.app).get('/api/admin/schools').set(auth(tok))).status).toBe(401);
    }
    expect((await request(ctx.app).get('/api/admin/schools').set(adminAuth)).status).toBe(200);
  });
});

describe('words and invites across schools', () => {
  it("custom words are visible only inside their school; foreign word ids are 'unknown'", async () => {
    const search = (t: string, q: string) => request(ctx.app).get(`/api/words?q=${q}`).set(auth(t));
    expect((await search(tA, 'zephyr')).body.items.map((w: { id: string }) => w.id)).toEqual([customWord]);
    expect((await search(tA2, 'zephyr')).body.items.map((w: { id: string }) => w.id)).toEqual([customWord]); // same school
    expect((await search(tB, 'zephyr')).body).toEqual({ total: 0, items: [] });
    expect((await search(B.adminToken, 'zephyr')).body.total).toBe(0);
    expect(await ctx.db.get<{ school_id: number }>('SELECT school_id FROM words WHERE id = ?', [customWord])).toEqual({ school_id: A.schoolId });
    // bank words stay global
    expect((await search(tB, 'a')).body.total).toBeGreaterThan(0);

    const clsB = (await makeClass(ctx.app, tB)).cls;
    const ids = ['d001-1', 'd001-2', 'd001-3', 'd001-4', customWord];
    const put = await request(ctx.app).put(`/api/classes/${clsB.id}/daily-words/2026-11-21`).set(auth(tB)).send({ wordIds: ids });
    expect(put.status).toBe(400);
    expect(put.body.error.message).toContain('Unknown word id');
    expect((await request(ctx.app).put(`/api/classes/${cls.id}/daily-words/2026-11-21`).set(auth(tA)).send({ wordIds: ids })).status).toBe(200);
  });

  it("a school's invites and reset links only work for that school's teachers", async () => {
    const codeA = A.teacherCode;
    const reg = await request(ctx.app).post('/api/auth/teacher/register').send({ inviteCode: codeA, name: 'N', email: 'newbie@x.in', password: 'password1' });
    expect(reg.body.teacher.schoolId).toBe(A.schoolId);
    expect(reg.body.school.name).toBe('School A');
    // a reset link made by school B's admin for B's teacher cannot touch A's teacher
    const link = await request(ctx.app).post(`/api/school/teachers/${tBId}/reset-link`).set(auth(B.adminToken));
    const done = await request(ctx.app).post('/api/auth/password-reset').send({ code: link.body.code, password: 'new-password-1' });
    expect(done.body.teacher.email).toBe('tb@x.in');
    expect(done.body.teacher.schoolId).toBe(B.schoolId);
    expect((await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'ta@x.in', password: 'password1' })).status).toBe(200);
  });
});

describe('privacy', () => {
  it('public endpoints expose only first name, avatar and roll number', async () => {
    const r = await request(ctx.app).get(`/api/join/class/${cls.classCode}`);
    for (const s of r.body.students) expect(Object.keys(s).sort()).toEqual(['avatar', 'firstName', 'id', 'rollNo']);
    const legacy = await request(ctx.app).get(`/api/auth/classes/${cls.classCode}/roster`);
    for (const s of legacy.body.students) expect(Object.keys(s).sort()).toEqual(['avatar', 'firstName', 'id']);
    const blob = JSON.stringify([r.body, legacy.body, (await request(ctx.app).get(`/api/join/school/${A.studentCode}`)).body]);
    for (const s of students) expect(blob).not.toContain(`"${s.pin}"`);
    expect(blob).not.toMatch(/email|phone|surname|pin/i);
    // a student's own /me and login responses never carry the PIN
    const login = await request(ctx.app).post('/api/auth/student/login').send({ classCode: cls.classCode, studentId: students[1]!.id, pin: students[1]!.pin });
    expect(JSON.stringify(login.body)).not.toContain('pin');
  });
});
