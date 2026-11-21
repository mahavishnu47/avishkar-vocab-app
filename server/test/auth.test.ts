import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, makeClass, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';
import { generateClassCode, generatePin, hashPassword, verifyPassword } from '../src/auth.ts';

let ctx: Ctx;
beforeEach(async () => { ctx = await setup(); });

describe('auth primitives', () => {
  it('hashes and verifies passwords', () => {
    const h = hashPassword('secret123');
    expect(h).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(verifyPassword('secret123', h)).toBe(true);
    expect(verifyPassword('secret124', h)).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
  it('generates class codes and PINs in the documented alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateClassCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      const pin = generatePin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(['0000', '1111', '1234']).not.toContain(pin);
    }
  });
});

describe('teacher auth', () => {
  it('registers, rejects duplicates, short passwords and wrong invite code', async () => {
    const r = await request(ctx.app).post('/api/auth/teacher/register').send({ name: 'A', email: 'a@x.in', password: 'password1' });
    expect(r.status).toBe(201);
    expect(r.body.teacher).toMatchObject({ name: 'A', email: 'a@x.in' });
    expect(r.body.token).toMatch(/^[0-9a-f]{64}$/);

    const dup = await request(ctx.app).post('/api/auth/teacher/register').send({ name: 'A', email: 'A@x.in', password: 'password1' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('conflict');

    const short = await request(ctx.app).post('/api/auth/teacher/register').send({ name: 'B', email: 'b@x.in', password: 'short' });
    expect(short.status).toBe(400);

    process.env.TEACHER_INVITE_CODE = 'letmein';
    const noInvite = await request(ctx.app).post('/api/auth/teacher/register').send({ name: 'B', email: 'b@x.in', password: 'password1' });
    expect(noInvite.status).toBe(403);
    const withInvite = await request(ctx.app).post('/api/auth/teacher/register').send({ name: 'B', email: 'b@x.in', password: 'password1', inviteCode: 'letmein' });
    expect(withInvite.status).toBe(201);
  });

  it('logs in, rejects wrong credentials, serves /me and logs out', async () => {
    await registerTeacher(ctx.app, 'p@x.in');
    const bad = await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'p@x.in', password: 'nope-nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Wrong email or password');
    const unknown = await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'z@x.in', password: 'password1' });
    expect(unknown.status).toBe(401);

    const ok = await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'P@X.in', password: 'password1' });
    expect(ok.status).toBe(200);
    const me = await request(ctx.app).get('/api/auth/me').set(auth(ok.body.token));
    expect(me.body).toMatchObject({ role: 'teacher', teacher: { email: 'p@x.in' } });

    expect((await request(ctx.app).post('/api/auth/logout').set(auth(ok.body.token))).status).toBe(204);
    expect((await request(ctx.app).get('/api/auth/me').set(auth(ok.body.token))).status).toBe(401);
  });

  it('returns 401 JSON for missing, malformed and expired tokens', async () => {
    const none = await request(ctx.app).get('/api/classes');
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
    expect((await request(ctx.app).get('/api/classes').set('Authorization', 'Bearer nonsense')).status).toBe(401);
    expect((await request(ctx.app).get('/api/student/home')).status).toBe(401);

    const t = await registerTeacher(ctx.app);
    await ctx.db.run("UPDATE auth_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ?", [t]);
    expect((await request(ctx.app).get('/api/classes').set(auth(t))).status).toBe(401);
  });

  it('keeps teacher and student roles apart', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const st = await studentLogin(ctx.app, cls, students[0]!);
    expect((await request(ctx.app).get('/api/classes').set(auth(st))).status).toBe(401);
    expect((await request(ctx.app).get('/api/student/home').set(auth(t))).status).toBe(401);
  });

  it("a teacher cannot read another teacher's class", async () => {
    const t1 = await registerTeacher(ctx.app, 't1@x.in');
    const t2 = await registerTeacher(ctx.app, 't2@x.in');
    const { cls, students } = await makeClass(ctx.app, t1);
    const g = (path: string) => request(ctx.app).get(path).set(auth(t2));
    expect((await g(`/api/classes/${cls.id}/students`)).status).toBe(404);
    expect((await g(`/api/classes/${cls.id}/dashboard`)).status).toBe(404);
    expect((await g(`/api/classes/${cls.id}/analytics`)).status).toBe(404);
    expect((await g(`/api/classes/${cls.id}/leaderboard`)).status).toBe(404);
    expect((await g(`/api/classes/${cls.id}/export.csv?type=students`)).status).toBe(404);
    expect((await g(`/api/classes/${cls.id}/daily-words`)).status).toBe(404);
    expect((await g(`/api/students/${students[0]!.id}/analytics`)).status).toBe(404);
    expect((await request(ctx.app).patch(`/api/classes/${cls.id}`).set(auth(t2)).send({ name: 'x' })).status).toBe(404);
    expect((await request(ctx.app).patch(`/api/students/${students[0]!.id}`).set(auth(t2)).send({ active: false })).status).toBe(404);
    expect((await request(ctx.app).post(`/api/students/${students[0]!.id}/reset-pin`).set(auth(t2))).status).toBe(404);
    expect((await request(ctx.app).get('/api/classes').set(auth(t2))).body).toEqual([]);
  });
});

describe('student auth', () => {
  it('serves the public roster (case-insensitive code, active only, by name)', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t, ['Riya', 'Aarav', 'Kabir']);
    await request(ctx.app).patch(`/api/students/${students[2]!.id}`).set(auth(t)).send({ active: false });
    const r = await request(ctx.app).get(`/api/auth/classes/${cls.classCode.toLowerCase()}/roster`);
    expect(r.status).toBe(200);
    expect(r.body.className).toBe('5A');
    expect(r.body.students.map((s: { firstName: string }) => s.firstName)).toEqual(['Aarav', 'Riya']);
    expect(Object.keys(r.body.students[0]).sort()).toEqual(['avatar', 'firstName', 'id']);
    expect((await request(ctx.app).get('/api/auth/classes/ZZZZZZ/roster')).status).toBe(404);
  });

  it('logs in with the right PIN, 401 on wrong PIN, 404 for wrong class/inactive', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const riya = students[0]!;
    const ok = await request(ctx.app).post('/api/auth/student/login').send({ classCode: cls.classCode.toLowerCase(), studentId: riya.id, pin: riya.pin });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ className: '5A', student: { id: riya.id, firstName: 'Riya', active: true } });
    expect(ok.body.student.pin).toBeUndefined();
    const me = await request(ctx.app).get('/api/auth/me').set(auth(ok.body.token));
    expect(me.body).toMatchObject({ role: 'student', classRoom: { id: cls.id, name: '5A', leaderboardMode: 'individual' } });

    const wrongPin = riya.pin === '9999' ? '9998' : '9999';
    const bad = await request(ctx.app).post('/api/auth/student/login').send({ classCode: cls.classCode, studentId: riya.id, pin: wrongPin });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Wrong PIN');

    expect((await request(ctx.app).post('/api/auth/student/login').send({ classCode: 'ZZZZZZ', studentId: riya.id, pin: riya.pin })).status).toBe(404);
    await request(ctx.app).patch(`/api/students/${riya.id}`).set(auth(t)).send({ active: false });
    expect((await request(ctx.app).post('/api/auth/student/login').send({ classCode: cls.classCode, studentId: riya.id, pin: riya.pin })).status).toBe(404);
    // an already-issued token stops working once the student is inactive
    expect((await request(ctx.app).get('/api/student/home').set(auth(ok.body.token))).status).toBe(401);
  });

  it('locks for 5 minutes after 5 wrong PINs; a correct PIN resets the counter; reset-pin unlocks', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const riya = students[0]!;
    const wrong = riya.pin === '9999' ? '9998' : '9999';
    const login = (pin: string) => request(ctx.app).post('/api/auth/student/login').send({ classCode: cls.classCode, studentId: riya.id, pin });

    for (let i = 0; i < 4; i++) expect((await login(wrong)).status).toBe(401);
    expect((await login(riya.pin)).status).toBe(200); // resets the counter
    for (let i = 0; i < 5; i++) expect((await login(wrong)).status).toBe(401);
    const locked = await login(riya.pin); // even the right PIN is refused while locked
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('locked');

    const reset = await request(ctx.app).post(`/api/students/${riya.id}/reset-pin`).set(auth(t));
    expect(reset.status).toBe(200);
    expect(reset.body.pin).toMatch(/^\d{4}$/);
    expect((await login(reset.body.pin)).status).toBe(200);

    // lock expires by time
    for (let i = 0; i < 6; i++) await login(reset.body.pin === '9999' ? '9998' : '9999');
    expect((await login(reset.body.pin)).status).toBe(423);
    await ctx.db.run("UPDATE students SET locked_until = '2000-01-01T00:00:00.000Z' WHERE id = ?", [riya.id]);
    expect((await login(reset.body.pin)).status).toBe(200);
  });
});

describe('misc', () => {
  it('health, unknown route and bad JSON', async () => {
    expect((await request(ctx.app).get('/api/health')).body).toEqual({ ok: true, db: 'ok', words: expect.any(Number), ai: false, version: '0.1.0' });
    const nf = await request(ctx.app).get('/api/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not_found');
    const bad = await request(ctx.app).post('/api/auth/teacher/login').set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('bad_request');
  });
});

describe('brute-force throttle (B-03)', () => {
  it('locks teacher login after 8 wrong passwords, even for the right one, and unlocks per email only', async () => {
    await registerTeacher(ctx.app, 'a@school.in');
    await registerTeacher(ctx.app, 'b@school.in');
    for (let i = 0; i < 8; i++) {
      const r = await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'a@school.in', password: `wrong-pass-${i}` });
      expect(r.status).toBe(401);
    }
    const locked = await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'a@school.in', password: 'password1' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('locked');
    expect(locked.body.error.message).toMatch(/wait \d+ minutes?/);
    // another account from the same IP is unaffected
    const other = await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'b@school.in', password: 'password1' });
    expect(other.status).toBe(200);
  });

  it('a successful login resets the failure counter', async () => {
    await registerTeacher(ctx.app, 'a@school.in');
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 7; i++) await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'a@school.in', password: 'nope-nope' });
      const ok = await request(ctx.app).post('/api/auth/teacher/login').send({ email: 'a@school.in', password: 'password1' });
      expect(ok.status).toBe(200);
    }
  });

  it('locks class-code lookups once an IP has too many misses, but valid codes still count nothing', async () => {
    const { cls } = await makeClass(ctx.app, await registerTeacher(ctx.app), ['Riya']);
    for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) {
      await ctx.db.run('INSERT INTO auth_throttle (key, fails, window_start) VALUES (?, 99, ?)', [`roster-ip:${ip}`, new Date().toISOString()]);
    }
    const ok = await request(ctx.app).get(`/api/auth/classes/${cls.classCode}/roster`);
    expect(ok.status).toBe(200);
    const miss = await request(ctx.app).get('/api/auth/classes/NOPE12/roster');
    expect(miss.status).toBe(404); // the 100th miss locks the key
    const locked = await request(ctx.app).get(`/api/auth/classes/${cls.classCode}/roster`);
    expect(locked.status).toBe(429);
  });
});

describe('teacher sign-up in production (B-09)', () => {
  it('is closed without an invite code and open with the right one', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const closed = await request(ctx.app).post('/api/auth/teacher/register').send({ name: 'X', email: 'x@school.in', password: 'password1' });
      expect(closed.status).toBe(403);
      expect(closed.body.error.message).toMatch(/INVITE_CODE/);
      process.env.TEACHER_INVITE_CODE = 'letmein';
      const ok = await request(ctx.app).post('/api/auth/teacher/register').send({ name: 'X', email: 'x@school.in', password: 'password1', inviteCode: 'letmein' });
      expect(ok.status).toBe(201);
    } finally {
      process.env.NODE_ENV = prev;
      delete process.env.TEACHER_INVITE_CODE;
    }
  });
});
