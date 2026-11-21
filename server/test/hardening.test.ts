import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, makeClass, registerTeacher, setup, type Ctx } from './helpers.ts';

let ctx: Ctx;
let teacher: string;
beforeEach(async () => {
  ctx = await setup();
  teacher = await registerTeacher(ctx.app);
});

const NUL = 'a\u0000b';

describe('null characters are a 400, never a 500 (S-1)', () => {
  it('in a JSON body (class name, student name, login email)', async () => {
    const cls = await request(ctx.app).post('/api/classes').set(auth(teacher)).send({ name: NUL, standard: 5 });
    expect(cls.status).toBe(400);
    const { cls: real } = await makeClass(ctx.app, teacher, ['Riya']);
    const add = await request(ctx.app).post(`/api/classes/${real.id}/students`).set(auth(teacher))
      .send({ students: [{ rollNo: 50, firstName: NUL }], consentConfirmed: true });
    expect(add.status).toBe(400);
    const login = await request(ctx.app).post('/api/auth/teacher/login').send({ email: NUL, password: 'x' });
    expect(login.status).toBe(400);
  });
  it('in a query string and in a URL path', async () => {
    expect((await request(ctx.app).get('/api/words?q=' + encodeURIComponent(NUL)).set(auth(teacher))).status).toBe(400);
    expect((await request(ctx.app).get('/api/invites/' + encodeURIComponent(NUL))).status).toBe(400);
  });
  it('normal text, emoji and Devanagari still pass', async () => {
    const ok = await request(ctx.app).post('/api/classes').set(auth(teacher)).send({ name: '5A 🦜 सानिका', standard: 5 });
    expect(ok.status).toBe(201);
  });
});

describe('ids bigger than the database can hold are a 404, never a 500 (S-2)', () => {
  it('for classes, students and school teachers', async () => {
    const huge = '9'.repeat(30);
    expect((await request(ctx.app).get(`/api/classes/${huge}/students`).set(auth(teacher))).status).toBe(404);
    expect((await request(ctx.app).get('/api/classes/2147483648/students').set(auth(teacher))).status).toBe(404);
    expect((await request(ctx.app).patch(`/api/students/${huge}`).set(auth(teacher)).send({ active: false })).status).toBe(404);
  });
});

describe('classes (T-1, T-2)', () => {
  it('eight simultaneous "Create class" requests make exactly one class (T-1)', async () => {
    const rs = await Promise.all(Array.from({ length: 8 }, () => request(ctx.app).post('/api/classes').set(auth(teacher)).send({ standard: 6, division: 'Z' })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(7);
    expect(rs.some((r) => r.status >= 500)).toBe(false);
    const list = await request(ctx.app).get('/api/classes').set(auth(teacher));
    expect(list.body.filter((c: { name: string }) => c.name === '6Z')).toHaveLength(1);
  });

  it('absurd start dates are refused (T-2)', async () => {
    for (const startDate of ['1800-01-01', '9999-12-31', '2019-12-31']) {
      const r = await request(ctx.app).post('/api/classes').set(auth(teacher)).send({ standard: 7, division: 'Q', startDate });
      expect(r.status).toBe(400);
    }
    const ok = await request(ctx.app).post('/api/classes').set(auth(teacher)).send({ standard: 7, division: 'Q', startDate: '2026-06-15' });
    expect(ok.status).toBe(201);
  });
});

describe('teacher invite limit (T-6)', () => {
  it('a new school teacher invite stops after its use limit instead of working for everyone', async () => {
    const { makeSchool } = await import('./helpers.ts');
    const sch = await makeSchool(ctx.app);
    const code = sch.teacherCode as string;
    const info = await request(ctx.app).get(`/api/invites/${code}`);
    expect(info.status).toBe(200);
    const rows = await ctx.db.all<{ max_uses: number | null }>("SELECT max_uses FROM invites WHERE kind = 'teacher'");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.max_uses !== null && r.max_uses <= 500)).toBe(true);
  });
});

describe('environment values are cleaned (H-1)', () => {
  it('removes BOMs, whitespace and wrapping quotes', async () => {
    const { cleanEnvValue, cleanEnv } = await import('../src/env.ts');
    expect(cleanEnvValue('﻿https://x.vercel.app')).toBe('https://x.vercel.app');
    expect(cleanEnvValue('  secret-value\r\n')).toBe('secret-value');
    expect(cleanEnvValue('"quoted"')).toBe('quoted');
    expect(cleanEnvValue('plain')).toBe('plain');
    const env: NodeJS.ProcessEnv = { PUBLIC_APP_URL: '﻿https://a.b', SUPER_ADMIN_SECRET: 'abc\n', OTHER: ' keep ' };
    cleanEnv(env);
    expect(env).toEqual({ PUBLIC_APP_URL: 'https://a.b', SUPER_ADMIN_SECRET: 'abc', OTHER: ' keep ' });
  });
});

describe('names count what people see (Pr-1)', () => {
  it('51 emoji is a 51-character school name, and 101 is too long', async () => {
    const { makeSchool } = await import('./helpers.ts');
    const sch = await makeSchool(ctx.app);
    const ok = await request(ctx.app).patch('/api/school').set(auth(sch.adminToken)).send({ name: '🏫'.repeat(51) });
    expect(ok.status).toBe(200);
    const tooLong = await request(ctx.app).patch('/api/school').set(auth(sch.adminToken)).send({ name: '🏫'.repeat(101) });
    expect(tooLong.status).toBe(400);
  });
});
