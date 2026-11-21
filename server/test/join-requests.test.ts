import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, makeClass, registerTeacher, setup, type Ctx } from './helpers.ts';

let ctx: Ctx;
beforeEach(async () => { ctx = await setup(); });

const ask = (code: string, body: object) => request(ctx.app).post(`/api/join/class/${code}/request`).send(body);

describe('join requests: public', () => {
  it('creates a request and reports status only with the secret', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    const r = await ask(cls.classCode, { firstName: '  Meera ', rollNo: 7 });
    expect(r.status).toBe(201);
    expect(r.body.secret).toMatch(/^[0-9a-f]{32}$/);
    const s = await request(ctx.app).get(`/api/join/request/${r.body.requestId}`).query({ secret: r.body.secret });
    expect(s.body).toEqual({ status: 'pending', firstName: 'Meera' });
    expect((await request(ctx.app).get(`/api/join/request/${r.body.requestId}`).query({ secret: 'nope' })).status).toBe(404);
    expect((await request(ctx.app).get(`/api/join/request/${r.body.requestId}`)).status).toBe(404);
    expect((await request(ctx.app).get('/api/join/request/99999').query({ secret: r.body.secret })).status).toBe(404);
  });

  it('404 for unknown or closed classes', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    expect((await ask('ZZZZZZ', { firstName: 'Meera' })).status).toBe(404);
    await request(ctx.app).patch(`/api/classes/${cls.id}`).set(auth(t)).send({ joinEnabled: false });
    expect((await ask(cls.classCode, { firstName: 'Meera' })).status).toBe(404);
  });

  it('rejects bad names', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    for (const firstName of ['', 'Meera Patil', 'I want to join please', '😀😀😀', 'Me😀', 'a'.repeat(31), 'R2D2', 'Ab\u0000c', 'Meera\nPatil']) {
      expect((await ask(cls.classCode, { firstName })).status, firstName).toBe(400);
    }
    expect((await ask(cls.classCode, { firstName: 'Meera', rollNo: 0 })).status).toBe(400);
    expect((await ask(cls.classCode, {})).status).toBe(400);
    expect((await ask(cls.classCode, { firstName: 'आरव' })).status).toBe(201);
    expect((await ask(cls.classCode, { firstName: "D'Souza-Rao" })).status).toBe(201);
  });

  it('dedupes identical pending names and caps pending requests per class', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    expect((await ask(cls.classCode, { firstName: 'Meera' })).status).toBe(201);
    expect((await ask(cls.classCode, { firstName: 'meera' })).status).toBe(409);
    for (let i = 1; i < 50; i++) {
      const name = `Kid${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`.replace(/[0-9]/g, '');
      expect((await ask(cls.classCode, { firstName: name })).status, name).toBe(201);
    }
    const over = await ask(cls.classCode, { firstName: 'Extra' });
    expect(over.status).toBe(409);
    const list = await request(ctx.app).get(`/api/classes/${cls.id}/join-requests`).set(auth(t));
    expect(list.body).toHaveLength(50);
  });
});

describe('join requests: teacher', () => {
  it('lists, approves (new student with PIN) and the child sees Approved', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya', 'Aarav']);
    const r = await ask(cls.classCode, { firstName: 'Meera' });
    const list = await request(ctx.app).get(`/api/classes/${cls.id}/join-requests`).set(auth(t));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: r.body.requestId, firstName: 'Meera', requestedRollNo: null });
    expect(list.body[0]).not.toHaveProperty('secret');

    const ap = await request(ctx.app).post(`/api/classes/${cls.id}/join-requests/${r.body.requestId}/approve`).set(auth(t)).send({});
    expect(ap.status).toBe(201);
    expect(ap.body).toMatchObject({ firstName: 'Meera', rollNo: 3, classId: cls.id, active: true });
    expect(ap.body.pin).toMatch(/^\d{4}$/);
    expect(ap.body.avatar).toBeTruthy();
    const roster = await request(ctx.app).get(`/api/classes/${cls.id}/students`).set(auth(t));
    expect(roster.body.map((s: { firstName: string }) => s.firstName)).toContain('Meera');
    expect((await request(ctx.app).get(`/api/classes/${cls.id}/join-requests`).set(auth(t))).body).toEqual([]);
    const st = await request(ctx.app).get(`/api/join/request/${r.body.requestId}`).query({ secret: r.body.secret });
    expect(st.body.status).toBe('approved');
    expect(st.body).not.toHaveProperty('pin');
    // approving twice
    expect((await request(ctx.app).post(`/api/classes/${cls.id}/join-requests/${r.body.requestId}/approve`).set(auth(t)).send({})).status).toBe(409);
    const log = await ctx.db.all("SELECT action FROM audit_log WHERE action LIKE 'join_request.%'");
    expect(log.map((l) => l.action)).toEqual(['join_request.approve']);
  });

  it('uses the requested or chosen roll number and 409s when it is taken', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya', 'Aarav']);
    const a = await ask(cls.classCode, { firstName: 'Meera', rollNo: 2 });
    const clash = await request(ctx.app).post(`/api/classes/${cls.id}/join-requests/${a.body.requestId}/approve`).set(auth(t)).send({});
    expect(clash.status).toBe(409);
    expect(clash.body.error.message).toMatch(/Roll number 2/);
    expect((await request(ctx.app).get(`/api/join/request/${a.body.requestId}`).query({ secret: a.body.secret })).body.status).toBe('pending');
    const ok = await request(ctx.app).post(`/api/classes/${cls.id}/join-requests/${a.body.requestId}/approve`).set(auth(t)).send({ rollNo: 20 });
    expect(ok.status).toBe(201);
    expect(ok.body.rollNo).toBe(20);
    const b = await ask(cls.classCode, { firstName: 'Zoya', rollNo: 9 });
    const ok2 = await request(ctx.app).post(`/api/classes/${cls.id}/join-requests/${b.body.requestId}/approve`).set(auth(t)).send({});
    expect(ok2.body.rollNo).toBe(9);
  });

  it('rejects (removes) a request', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    const r = await ask(cls.classCode, { firstName: 'Stranger' });
    const rej = await request(ctx.app).post(`/api/classes/${cls.id}/join-requests/${r.body.requestId}/reject`).set(auth(t)).send({});
    expect(rej.status).toBe(200);
    expect((await request(ctx.app).get(`/api/join/request/${r.body.requestId}`).query({ secret: r.body.secret })).body.status).toBe('rejected');
    expect((await request(ctx.app).post(`/api/classes/${cls.id}/join-requests/${r.body.requestId}/approve`).set(auth(t)).send({})).status).toBe(409);
    const roster = await request(ctx.app).get(`/api/classes/${cls.id}/students`).set(auth(t));
    expect(roster.body).toHaveLength(1);
    // a rejected name can ask again
    expect((await ask(cls.classCode, { firstName: 'Stranger' })).status).toBe(201);
  });

  it('is tenant-isolated: another school gets 404, no token gets 401', async () => {
    const t1 = await registerTeacher(ctx.app, 'a@school.in');
    const t2 = await registerTeacher(ctx.app, 'b@school.in');
    const { cls } = await makeClass(ctx.app, t1, ['Riya']);
    const r = await ask(cls.classCode, { firstName: 'Meera' });
    const base = `/api/classes/${cls.id}/join-requests`;
    expect((await request(ctx.app).get(base).set(auth(t2))).status).toBe(404);
    expect((await request(ctx.app).post(`${base}/${r.body.requestId}/approve`).set(auth(t2)).send({})).status).toBe(404);
    expect((await request(ctx.app).post(`${base}/${r.body.requestId}/reject`).set(auth(t2)).send({})).status).toBe(404);
    expect((await request(ctx.app).get(base)).status).toBe(401);
    // request id from another class of the same teacher does not cross over
    const { cls: other } = await makeClass(ctx.app, t1, ['Om'], undefined, 'B');
    expect((await request(ctx.app).post(`/api/classes/${other.id}/join-requests/${r.body.requestId}/approve`).set(auth(t1)).send({})).status).toBe(404);
  });
});
