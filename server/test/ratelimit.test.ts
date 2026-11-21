/**
 * Postgres-backed rate limits (docs/ONBOARDING_SPEC.md 4.3). RATE_LIMIT_OFF is cleared here.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUCKETS } from '../src/services/rateLimit.ts';
import { adminAuth, makeClass, makeSchool, registerTeacher, setup, type Ctx } from './helpers.ts';

let ctx: Ctx;
beforeEach(async () => {
  ctx = await setup();
  delete process.env.RATE_LIMIT_OFF; // setup() turns it off for the other suites
});

const ip = (n: number) => `10.0.0.${n}`;

describe('rate limits', () => {
  it('join: 120 lookups per IP per window, then 429 with a friendly message; other IPs unaffected', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t);
    const hit = (n: number) => request(ctx.app).get(`/api/join/class/${cls.classCode}`).set('X-Forwarded-For', ip(n));
    for (let i = 0; i < 120; i++) expect((await hit(1)).status).toBe(200);
    const over = await hit(1);
    expect(over.status).toBe(429);
    expect(over.body.error).toEqual({ code: 'rate_limited', message: 'Too many tries. Wait a few minutes 🙂' });
    expect((await request(ctx.app).get('/api/join/school/ABCDEF').set('X-Forwarded-For', ip(1))).status).toBe(429); // shared bucket
    expect((await request(ctx.app).get(`/api/auth/classes/${cls.classCode}/roster`).set('X-Forwarded-For', ip(1))).status).toBe(429);
    expect((await hit(2)).status).toBe(200);
  });

  it('the window resets (old rows are ignored) and counters are stored hashed, not as raw IPs', async () => {
    const hit = () => request(ctx.app).get('/api/join/school/ABCDEF').set('X-Forwarded-For', ip(9));
    for (let i = 0; i < 120; i++) await hit();
    expect((await hit()).status).toBe(429);
    const keys = (await ctx.db.all<{ key: string }>('SELECT key FROM rate_limits')).map((r) => r.key);
    expect(keys.every((k) => /^join:[0-9a-f]{16}$/.test(k))).toBe(true);
    expect(keys.join()).not.toContain('10.0.0.9');
    await ctx.db.run("UPDATE rate_limits SET window_start = '2000-01-01T00:00:00.000Z'");
    expect((await hit()).status).toBe(404); // reached the handler again (unknown school), not 429
  });

  it('pin: only wrong PINs count; a busy IP is stopped without locking other children', async () => {
    const realLimit = BUCKETS.pin.limit;
    (BUCKETS.pin as { limit: number }).limit = 60; // the real limit is 600; shrink it so the test stays small
    try {
    const t = await registerTeacher(ctx.app);
    const names = Array.from({ length: 16 }, (_, i) => `Kid${i + 1}`);
    const { cls, students } = await makeClass(ctx.app, t, names);
    const login = (s: { id: number; pin: string }, pin: string, n: number) =>
      request(ctx.app).post('/api/auth/student/login').set('X-Forwarded-For', ip(n)).send({ classCode: cls.classCode, studentId: s.id, pin });
    const wrongOf = (pin: string) => (pin === '9999' ? '9998' : '9999');

    // correct logins do not count
    for (let i = 0; i < 5; i++) expect((await login(students[15]!, students[15]!.pin, 5)).status).toBe(200);
    // 15 children x 4 wrong PINs = 60 wrong from IP 5 (each child stays below their own 5-strike lock)
    for (const s of students.slice(0, 15)) {
      for (let i = 0; i < 4; i++) expect((await login(s, wrongOf(s.pin), 5)).status).toBe(401);
    }
    const blocked = await login(students[0]!, students[0]!.pin, 5); // even the right PIN is refused: the IP is over the limit
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toEqual({ code: 'rate_limited', message: 'Too many tries on this Wi-Fi. Wait a few minutes 🙂' });
    // no child was locked by the IP limit
    expect((await ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM students WHERE locked_until IS NOT NULL'))!.n).toBe(0);
    // another IP (another phone) logs in as the same child immediately
    expect((await login(students[0]!, students[0]!.pin, 6)).status).toBe(200);
    expect((await login(students[1]!, students[1]!.pin, 6)).status).toBe(200);
    } finally { (BUCKETS.pin as { limit: number }).limit = realLimit; }
  });

  it('pin: the per-student 5-strike lock still works with limits on', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const s = students[0]!;
    const wrong = s.pin === '9999' ? '9998' : '9999';
    const login = (pin: string) => request(ctx.app).post('/api/auth/student/login').set('X-Forwarded-For', ip(7)).send({ classCode: cls.classCode, studentId: s.id, pin });
    for (let i = 0; i < 5; i++) expect((await login(wrong)).status).toBe(401);
    const locked = await login(s.pin);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('locked');
  });

  it('invite: 20 lookups per IP, and bad-code redemptions count too', async () => {
    const sch = await makeSchool(ctx.app);
    const info = (n: number, code = sch.teacherCode) => request(ctx.app).get(`/api/invites/${code}`).set('X-Forwarded-For', ip(n));
    for (let i = 0; i < 20; i++) expect((await info(1)).status).toBe(200);
    const over = await info(1);
    expect(over.status).toBe(429);
    expect(over.body.error.message).toBe('Too many tries. Wait 10 minutes.');
    expect((await info(2)).status).toBe(200);

    const reg = (n: number, code: string) =>
      request(ctx.app).post('/api/auth/teacher/register').set('X-Forwarded-For', ip(n)).send({ inviteCode: code, name: 'T', email: `g${n}-${code}@x.in`, password: 'password1' });
    for (let i = 0; i < 20; i++) expect((await reg(3, 'ZZZZZZZZ')).status).toBe(404);
    expect((await reg(3, sch.teacherCode)).status).toBe(429); // guessing locks out even the right code from that IP
    expect((await reg(4, sch.teacherCode)).status).toBe(201);
    // good redemptions do not count against the limit
    for (let i = 0; i < 25; i++) expect((await request(ctx.app).post('/api/auth/teacher/register').set('X-Forwarded-For', ip(8)).send({ inviteCode: sch.teacherCode, name: 'T', email: 'dup@x.in', password: 'password1' })).status).toBeLessThan(410);
  }, 60_000);

  it('tlogin: 10 failures per IP+email, then 429 even for the right password; other emails are fine', async () => {
    await registerTeacher(ctx.app, 'locked@x.in');
    await registerTeacher(ctx.app, 'other@x.in');
    const login = (email: string, password: string) => request(ctx.app).post('/api/auth/teacher/login').set('X-Forwarded-For', ip(1)).send({ email, password });
    for (let i = 0; i < 10; i++) expect((await login('locked@x.in', 'wrong-wrong')).status).toBe(401);
    const over = await login('locked@x.in', 'password1');
    expect(over.status).toBe(429);
    expect(over.body.error.message).toBe('Too many tries. Wait 10 minutes or ask your school admin.');
    expect((await login('LOCKED@x.in', 'password1')).status).toBe(429); // case-insensitive key
    expect((await login('other@x.in', 'password1')).status).toBe(200);
    expect((await request(ctx.app).post('/api/auth/teacher/login').set('X-Forwarded-For', ip(2)).send({ email: 'locked@x.in', password: 'password1' })).status).toBe(200);
  }, 60_000);

  it('admin: 5 wrong secrets per IP, then 429 even for the right one', async () => {
    const call = (n: number, secret: string) => request(ctx.app).get('/api/admin/schools').set('X-Forwarded-For', ip(n)).set('X-Admin-Secret', secret);
    expect((await call(1, adminAuth['X-Admin-Secret'])).status).toBe(200); // correct secrets do not count
    for (let i = 0; i < 5; i++) expect((await call(1, 'wrong-secret-0123456789')).status).toBe(401);
    const over = await call(1, adminAuth['X-Admin-Secret']);
    expect(over.status).toBe(429);
    expect(over.body.error).toEqual({ code: 'rate_limited', message: 'Too many tries.' });
    expect((await call(2, adminAuth['X-Admin-Secret'])).status).toBe(200);
  });

  it('is skipped when RATE_LIMIT_OFF=1', async () => {
    process.env.RATE_LIMIT_OFF = '1';
    for (let i = 0; i < 130; i++) await request(ctx.app).get('/api/join/school/ABCDEF').set('X-Forwarded-For', ip(1));
    expect((await request(ctx.app).get('/api/join/school/ABCDEF').set('X-Forwarded-For', ip(1))).status).toBe(404);
    expect((await ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM rate_limits'))!.n).toBe(0);
  });
});
