import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, makeClass, registerTeacher, setup, type Ctx } from './helpers.ts';

let ctx: Ctx;
beforeEach(async () => { ctx = await setup(); });

describe('classes', () => {
  it('creates, lists (newest first) and patches classes', async () => {
    const t = await registerTeacher(ctx.app);
    const a = await request(ctx.app).post('/api/classes').set(auth(t)).send({ name: '5A' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ name: '5A', startDate: '2026-11-20', leaderboardMode: 'individual' });
    expect(a.body.classCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const b = await request(ctx.app).post('/api/classes').set(auth(t)).send({ name: '5B', startDate: '2026-11-25' });
    expect(b.body.startDate).toBe('2026-11-25');
    const list = await request(ctx.app).get('/api/classes').set(auth(t));
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(['5B', '5A']);

    const p = await request(ctx.app).patch(`/api/classes/${a.body.id}`).set(auth(t)).send({ leaderboardMode: 'hidden', name: '5A2' });
    expect(p.body).toMatchObject({ leaderboardMode: 'hidden', name: '5A2', startDate: '2026-11-20' });
    expect((await request(ctx.app).patch(`/api/classes/${a.body.id}`).set(auth(t)).send({ leaderboardMode: 'team' })).status).toBe(400);
    expect((await request(ctx.app).post('/api/classes').set(auth(t)).send({ name: '' })).status).toBe(400);
    expect((await request(ctx.app).post('/api/classes').set(auth(t)).send({ name: 'x', startDate: '2026-13-45' })).status).toBe(400);
  });
});

describe('roster paste-add', () => {
  it('adds students with deterministic avatars and random PINs, ordered by roll', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t, ['Riya', 'Aarav']);
    expect(students[0]).toMatchObject({ rollNo: 1, firstName: 'Riya', avatar: '🦁', active: true, classId: cls.id });
    expect(students[1]!.avatar).toBe('🐯');
    expect(students[0]!.pin).toMatch(/^\d{4}$/);

    const more = await request(ctx.app).post(`/api/classes/${cls.id}/students`).set(auth(t))
      .send({ students: [{ rollNo: 21, firstName: '  Sai  ' }, { rollNo: 3, firstName: 'Om' }] });
    expect(more.status).toBe(201);
    expect(more.body).toHaveLength(2);
    expect(more.body[0]).toMatchObject({ firstName: 'Sai', avatar: '🦁' }); // (21-1)%20 = 0
    const all = await request(ctx.app).get(`/api/classes/${cls.id}/students`).set(auth(t));
    expect(all.body.map((s: { rollNo: number }) => s.rollNo)).toEqual([1, 2, 3, 21]);
  });

  it('409 on a duplicate roll (existing or within the request) with no partial insert', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    const r = await request(ctx.app).post(`/api/classes/${cls.id}/students`).set(auth(t))
      .send({ students: [{ rollNo: 5, firstName: 'New' }, { rollNo: 1, firstName: 'Dup' }] });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('conflict');
    const inReq = await request(ctx.app).post(`/api/classes/${cls.id}/students`).set(auth(t))
      .send({ students: [{ rollNo: 7, firstName: 'A' }, { rollNo: 7, firstName: 'B' }] });
    expect(inReq.status).toBe(409);
    const all = await request(ctx.app).get(`/api/classes/${cls.id}/students`).set(auth(t));
    expect(all.body).toHaveLength(1);
  });

  it('validates names, rolls and size', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    const post = (students: unknown) => request(ctx.app).post(`/api/classes/${cls.id}/students`).set(auth(t)).send({ students });
    expect((await post([])).status).toBe(400);
    expect((await post([{ rollNo: 9, firstName: '' }])).status).toBe(400);
    expect((await post([{ rollNo: 9, firstName: 'x'.repeat(31) }])).status).toBe(400);
    expect((await post([{ rollNo: 'nine', firstName: 'A' }])).status).toBe(400);
    expect((await post(Array.from({ length: 61 }, (_, i) => ({ rollNo: i + 100, firstName: 'A' })))).status).toBe(400);
    expect((await post(Array.from({ length: 60 }, (_, i) => ({ rollNo: i + 100, firstName: 'A' })))).status).toBe(201);
  });

  it('patches students (rename, deactivate, roll clash) and resets PINs', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const s = students[0]!;
    const p = await request(ctx.app).patch(`/api/students/${s.id}`).set(auth(t)).send({ firstName: 'Riyaa', active: false });
    expect(p.body).toMatchObject({ firstName: 'Riyaa', active: false, pin: s.pin });
    expect((await request(ctx.app).patch(`/api/students/${s.id}`).set(auth(t)).send({ rollNo: 2 })).status).toBe(409);
    const all = await request(ctx.app).get(`/api/classes/${cls.id}/students`).set(auth(t));
    expect(all.body).toHaveLength(3); // inactive included
  });
});
