/**
 * Onboarding v2: super admin, school setup, teacher invites, class and student join, device sharing, school admin.
 * Contract: docs/ONBOARDING_SPEC.md section 4.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../scripts/admin.ts';
import { ADMIN_SECRET, adminAuth, auth, makeClass, makeSchool, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';

let ctx: Ctx;
beforeEach(async () => { ctx = await setup(); });

const CODE_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const raw = (code: string) => code.replace('-', '');
const get = (path: string, token?: string) => request(ctx.app).get(path).set(token ? auth(token) : {});
const post = (path: string, body?: object, token?: string) => request(ctx.app).post(path).set(token ? auth(token) : {}).send(body ?? {});
const patch = (path: string, body: object, token: string) => request(ctx.app).patch(path).set(auth(token)).send(body);

describe('super admin API', () => {
  it('is off (404) when SUPER_ADMIN_SECRET is unset or shorter than 16 characters', async () => {
    delete process.env.SUPER_ADMIN_SECRET;
    expect((await request(ctx.app).get('/api/admin/schools').set(adminAuth)).status).toBe(404);
    process.env.SUPER_ADMIN_SECRET = 'short-secret';
    expect((await request(ctx.app).get('/api/admin/schools').set('X-Admin-Secret', 'short-secret')).status).toBe(404);
  });

  it('rejects a missing or wrong secret and a staff token (401)', async () => {
    expect((await request(ctx.app).get('/api/admin/schools')).status).toBe(401);
    expect((await request(ctx.app).get('/api/admin/schools').set('X-Admin-Secret', 'wrong-secret-1234567890')).status).toBe(401);
    expect((await request(ctx.app).get('/api/admin/schools').set('X-Admin-Secret', ADMIN_SECRET.slice(0, -1))).status).toBe(401);
    const sch = await makeSchool(ctx.app);
    expect((await get('/api/admin/schools', sch.adminToken)).status).toBe(401);
    expect((await request(ctx.app).post('/api/admin/schools').send({ name: 'X' })).status).toBe(401);
  });

  it('creates a school with a 14-day single-use setup link and a WhatsApp text', async () => {
    const r = await request(ctx.app).post('/api/admin/schools').set(adminAuth)
      .set('x-forwarded-proto', 'https').set('x-forwarded-host', 'shabd.example.org')
      .send({ name: '  ZP School Kalwa ', district: 'Thane', udiseCode: '27123456789' });
    expect(r.status).toBe(201);
    expect(r.body.school).toMatchObject({ name: 'ZP School Kalwa', district: 'Thane', status: 'active' });
    expect(r.body.school.studentCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const inv = r.body.setupInvite;
    expect(inv).toMatchObject({ kind: 'school_admin', maxUses: 1, useCount: 0, revokedAt: null });
    expect(inv.code).toMatch(CODE_RE);
    expect(inv.url).toBe(`https://shabd.example.org/a/${raw(inv.code)}`);
    const days = (Date.parse(inv.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    expect(r.body.whatsappText).toContain(inv.url);
    expect(r.body.whatsappText).toContain('This link works once');

    const list = await request(ctx.app).get('/api/admin/schools').set(adminAuth);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ school: { name: 'ZP School Kalwa' }, udiseCode: '27123456789', teachers: 0, classes: 0, students: 0 });
  });

  it('uses PUBLIC_APP_URL for links when set', async () => {
    process.env.PUBLIC_APP_URL = 'https://app.example.org/';
    try {
      const r = await request(ctx.app).post('/api/admin/schools').set(adminAuth).send({ name: 'S' });
      expect(r.body.setupInvite.url).toBe(`https://app.example.org/a/${raw(r.body.setupInvite.code)}`);
    } finally {
      delete process.env.PUBLIC_APP_URL;
    }
  });

  it('validates the create body', async () => {
    const c = (b: object) => request(ctx.app).post('/api/admin/schools').set(adminAuth).send(b);
    expect((await c({})).status).toBe(400);
    expect((await c({ name: '' })).status).toBe(400);
    expect((await c({ name: 'x'.repeat(101) })).status).toBe(400);
    expect((await c({ name: 'X', udiseCode: '123' })).status).toBe(400);
    expect((await c({ name: 'X', udiseCode: '1234567890a' })).status).toBe(400);
    expect((await c({ name: 'X', district: 'd'.repeat(61) })).status).toBe(400);
    expect((await c({ name: 'X', udiseCode: '27123456789' })).status).toBe(201);
  });

  it('makes extra setup links, 404 for an unknown school; suspend/resume with token revocation', async () => {
    const sch = await makeSchool(ctx.app, 'Pausable');
    const t = await registerTeacher(ctx.app, 'teach@x.in', sch);
    const { cls, students } = await makeClass(ctx.app, t);
    const st = await studentLogin(ctx.app, cls, students[0]!);

    const link = await request(ctx.app).post(`/api/admin/schools/${sch.schoolId}/setup-link`).set(adminAuth);
    expect(link.status).toBe(201);
    expect(link.body).toMatchObject({ kind: 'school_admin', maxUses: 1 });
    expect(link.body.whatsappText).toContain(link.body.url);
    expect((await request(ctx.app).post('/api/admin/schools/9999/setup-link').set(adminAuth)).status).toBe(404);
    expect((await request(ctx.app).patch('/api/admin/schools/9999').set(adminAuth).send({ name: 'X' })).status).toBe(404);

    const bad = await request(ctx.app).patch(`/api/admin/schools/${sch.schoolId}`).set(adminAuth).send({ status: 'gone' });
    expect(bad.status).toBe(400);
    const sus = await request(ctx.app).patch(`/api/admin/schools/${sch.schoolId}`).set(adminAuth).send({ status: 'suspended' });
    expect(sus.status).toBe(200);
    expect(sus.body.school.status).toBe('suspended');
    // every token of that school is gone
    expect((await get('/api/classes', t)).status).toBe(401);
    expect((await get('/api/school', sch.adminToken)).status).toBe(401);
    expect((await get('/api/student/home', st)).status).toBe(401);
    // nothing works while suspended
    const login = await post('/api/auth/teacher/login', { email: 'teach@x.in', password: 'password1' });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toBe('Your school is paused. Contact WordWise.');
    expect((await get(`/api/join/class/${cls.classCode}`)).status).toBe(404);
    expect((await get(`/api/join/school/${sch.studentCode}`)).status).toBe(404);
    expect((await post('/api/auth/student/login', { classCode: cls.classCode, studentId: students[0]!.id, pin: students[0]!.pin })).status).toBe(404);
    expect((await get(`/api/invites/${link.body.code}`)).status).toBe(404);
    expect((await post('/api/auth/school/setup', { code: link.body.code, name: 'P', email: 'p2@x.in', password: 'password1' })).status).toBe(404);

    const res = await request(ctx.app).patch(`/api/admin/schools/${sch.schoolId}`).set(adminAuth).send({ status: 'active', name: 'Renamed', district: 'Pune' });
    expect(res.body.school).toMatchObject({ status: 'active', name: 'Renamed', district: 'Pune' });
    expect((await post('/api/auth/teacher/login', { email: 'teach@x.in', password: 'password1' })).status).toBe(200);
    expect((await get(`/api/invites/${link.body.code}`)).status).toBe(200);
  });
});

describe('admin CLI service', () => {
  it('creates a school and prints a setup link that works; lists; makes another link', async () => {
    const out = await runAdmin(ctx.db, ['create-school', '--name', 'CLI School', '--district', 'Thane', '--udise', '27123456789']);
    const linkLine = out.find((l) => l.startsWith('Setup link: '))!;
    expect(linkLine).toMatch(/^Setup link: http:\/\/localhost:5173\/a\/[A-HJ-NP-Z2-9]{8}$/);
    const code = linkLine.split('/a/')[1]!;
    const ok = await post('/api/auth/school/setup', { code, name: 'Principal', email: 'cli@x.in', password: 'password1' });
    expect(ok.status).toBe(201);
    expect(ok.body.school.name).toBe('CLI School');

    const list = await runAdmin(ctx.db, ['list']);
    expect(list[0]).toContain('CLI School');
    expect(list[0]).toContain('teachers 1');
    const again = await runAdmin(ctx.db, ['setup-link', '--school', String(ok.body.school.id)]);
    expect(again[0]).toMatch(/^Setup link: .*\/a\/[A-HJ-NP-Z2-9]{8}$/);
    await expect(runAdmin(ctx.db, ['setup-link', '--school', 'x'])).rejects.toThrow('--school');
    await expect(runAdmin(ctx.db, ['create-school'])).rejects.toThrow();
    await expect(runAdmin(ctx.db, ['nope'])).rejects.toThrow('Usage');
  });
});

describe('school setup link', () => {
  const create = async (name = 'Setup School') => (await request(ctx.app).post('/api/admin/schools').set(adminAuth).send({ name })).body;
  const setup = (code: string, email = 'principal@x.in') => post('/api/auth/school/setup', { code, name: 'Principal', email, password: 'password1' });

  it('describes the link, then creates the admin, a teacher invite and audit rows', async () => {
    const c = await create();
    const info = await get(`/api/invites/${c.setupInvite.code.toLowerCase()}`); // lowercase and dash are fine
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ kind: 'school_admin', schoolName: 'Setup School' });
    expect(info.body.expiresAt).toBe(c.setupInvite.expiresAt);

    const r = await setup(c.setupInvite.code.replace('-', ' ').toLowerCase());
    expect(r.status).toBe(201);
    expect(r.body.teacher).toMatchObject({ role: 'school_admin', active: true, schoolId: c.school.id });
    expect(r.body.school).toEqual({ id: c.school.id, name: 'Setup School' });
    const me = await get('/api/auth/me', r.body.token);
    expect(me.body).toMatchObject({ role: 'teacher', teacher: { role: 'school_admin' }, school: { name: 'Setup School' } });

    const school = await get('/api/school', r.body.token);
    expect(school.body.teacherInvite.code).toMatch(CODE_RE);
    expect(school.body.teacherInvite).toMatchObject({ kind: 'teacher', maxUses: 30, useCount: 0 });
    expect(school.body.checklist).toEqual({ teacherLinkShared: false, firstTeacherJoined: false, firstClassCreated: false, firstStudentPlayed: false, done: false });

    const audit = (await ctx.db.all<{ action: string }>('SELECT action FROM audit_log WHERE school_id = ? ORDER BY id', [c.school.id])).map((a) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['school.create', 'invite.create', 'invite.redeem', 'teacher.join']));
  });

  it('is single use: a second redemption and the info lookup both say 404', async () => {
    const c = await create();
    expect((await setup(c.setupInvite.code)).status).toBe(201);
    const again = await setup(c.setupInvite.code, 'second@x.in');
    expect(again.status).toBe(404);
    expect(again.body.error.message).toContain('not valid');
    expect((await get(`/api/invites/${c.setupInvite.code}`)).status).toBe(404);
    expect((await ctx.db.get<{ use_count: number }>('SELECT use_count FROM invites WHERE id = ?', [c.setupInvite.id]))!.use_count).toBe(1);
  });

  it('two simultaneous redemptions of one single-use link: exactly one wins', async () => {
    const c = await create();
    const results = await Promise.all([setup(c.setupInvite.code, 'one@x.in'), setup(c.setupInvite.code, 'two@x.in')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 404]);
    expect((await ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM teachers'))!.n).toBe(1);
  });

  it('rejects expired, revoked, unknown, malformed and wrong-kind codes with the same 404', async () => {
    const c = await create();
    const msgs = new Set<string>();
    const expired = await create('Expired');
    await ctx.db.run("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", [expired.setupInvite.id]);
    const revoked = await create('Revoked');
    await ctx.db.run("UPDATE invites SET revoked_at = '2026-01-01T00:00:00.000Z' WHERE id = ?", [revoked.setupInvite.id]);
    const sch = await makeSchool(ctx.app);
    for (const code of [expired.setupInvite.code, revoked.setupInvite.code, 'ZZZZ-ZZZZ', 'ABC', 'A0O1-I1O0', '', sch.teacherCode /* wrong kind */]) {
      const r = await setup(code, `x${Math.random()}@x.in`);
      expect(r.status).toBe(code === '' ? 400 : 404);
      msgs.add(r.body.error.message);
      if (code !== '' && code !== sch.teacherCode) expect((await get(`/api/invites/${code}`)).status).toBe(404);
    }
    expect([...msgs].filter((m) => m.includes('not valid'))).toHaveLength(1);
    expect((await setup(c.setupInvite.code)).status).toBe(201); // the untouched one still works
  });

  it('409 on a duplicate email without consuming the link; validates the body', async () => {
    const other = await makeSchool(ctx.app, 'Other', 'taken@x.in');
    void other;
    const c = await create();
    const dup = await setup(c.setupInvite.code, 'TAKEN@x.in');
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('This email is already registered. Log in instead.');
    expect((await ctx.db.get<{ use_count: number }>('SELECT use_count FROM invites WHERE id = ?', [c.setupInvite.id]))!.use_count).toBe(0);
    expect((await post('/api/auth/school/setup', { code: c.setupInvite.code, name: 'P', email: 'bad', password: 'password1' })).status).toBe(400);
    expect((await post('/api/auth/school/setup', { code: c.setupInvite.code, name: 'P', email: 'ok@x.in', password: 'short' })).status).toBe(400);
    expect((await post('/api/auth/school/setup', { name: 'P', email: 'ok@x.in', password: 'password1' })).status).toBe(400);
    expect((await setup(c.setupInvite.code, 'fresh@x.in')).status).toBe(201);
  });

  it('a second admin via a new setup link reuses the live teacher invite instead of making another', async () => {
    const sch = await makeSchool(ctx.app);
    const link = await request(ctx.app).post(`/api/admin/schools/${sch.schoolId}/setup-link`).set(adminAuth);
    const r = await setup(link.body.code, 'admin2@x.in');
    expect(r.status).toBe(201);
    expect(r.body.teacher.role).toBe('school_admin');
    const n = await ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM invites WHERE school_id = ? AND kind = 'teacher'", [sch.schoolId]);
    expect(n!.n).toBe(1);
    const team = await get('/api/school/teachers', sch.adminToken);
    expect(team.body.map((t: { role: string }) => t.role)).toEqual(['school_admin', 'school_admin']);
  });
});

describe('teacher join (invite required, TEACHER_INVITE_CODE is gone)', () => {
  it('requires a valid invite and ignores the old environment variable', async () => {
    process.env.TEACHER_INVITE_CODE = 'LEGACY-CODE';
    try {
      const body = { name: 'T', email: 't@x.in', password: 'password1' };
      expect((await post('/api/auth/teacher/register', body)).status).toBe(400);
      expect((await post('/api/auth/teacher/register', { ...body, inviteCode: 'LEGACY-CODE' })).status).toBe(404);
      expect((await post('/api/auth/teacher/register', { ...body, inviteCode: 'ZZZZZZZZ' })).status).toBe(404);
    } finally {
      delete process.env.TEACHER_INVITE_CODE;
    }
    expect((await ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM teachers'))!.n).toBe(0);
  });

  it('no server source references TEACHER_INVITE_CODE', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    const root = join(import.meta.dirname, '../src');
    const hits = walk(root).filter((f) => f.endsWith('.ts') && readFileSync(f, 'utf8').includes('TEACHER_INVITE_CODE'));
    expect(hits).toEqual([]);
  });

  it('joins instantly with the school teacher invite (typed any way), unlimited uses', async () => {
    const sch = await makeSchool(ctx.app, 'Join School');
    const typed = ` ${sch.teacherCode.toLowerCase().replace('-', ' - ')} `;
    const a = await post('/api/auth/teacher/register', { inviteCode: typed, name: 'Mrs. A', email: 'a@x.in', password: 'password1' });
    expect(a.status).toBe(201);
    expect(a.body.teacher).toMatchObject({ role: 'teacher', schoolId: sch.schoolId });
    expect(a.body.school.name).toBe('Join School');
    const b = await post('/api/auth/teacher/register', { inviteCode: sch.teacherCode, name: 'Mr. B', email: 'b@x.in', password: 'password1' });
    expect(b.status).toBe(201);
    const info = await get(`/api/invites/${sch.teacherCode}`);
    expect(info.body).toMatchObject({ kind: 'teacher', schoolName: 'Join School' });
    expect(info.body.teacherName).toBeUndefined();
    const inv = await get('/api/school/invites', sch.adminToken);
    expect(inv.body[0].useCount).toBe(2);
    // plain teachers cannot reach admin endpoints
    expect((await get('/api/school', a.body.token)).status).toBe(403);
    expect((await get('/api/school/teachers', a.body.token)).status).toBe(403);
  });

  it('refuses revoked, expired, used-up and password-reset codes; a school_admin code makes an admin', async () => {
    const sch = await makeSchool(ctx.app);
    const reg = (code: string, email: string) => post('/api/auth/teacher/register', { inviteCode: code, name: 'T', email, password: 'password1' });
    // max uses
    const limited = await post('/api/school/invites', { maxUses: 1, expiresInDays: 7 }, sch.adminToken);
    expect(limited.status).toBe(201);
    expect(limited.body).toMatchObject({ maxUses: 1, useCount: 0 });
    expect((await reg(limited.body.code, 'u1@x.in')).status).toBe(201);
    const used = await reg(limited.body.code, 'u2@x.in');
    expect(used.status).toBe(404);
    expect((await get(`/api/invites/${limited.body.code}`)).status).toBe(404);
    // expired
    const exp = await post('/api/school/invites', {}, sch.adminToken);
    await ctx.db.run("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", [exp.body.id]);
    expect((await reg(exp.body.code, 'u3@x.in')).status).toBe(404);
    // revoked
    const rev = await post('/api/school/invites', {}, sch.adminToken);
    expect((await request(ctx.app).delete(`/api/school/invites/${rev.body.id}`).set(auth(sch.adminToken))).status).toBe(204);
    expect((await reg(rev.body.code, 'u4@x.in')).status).toBe(404);
    // a reset link is not a join code
    const t1 = await ctx.db.get<{ id: number }>("SELECT id FROM teachers WHERE email = 'u1@x.in'");
    const reset = await post(`/api/school/teachers/${t1!.id}/reset-link`, {}, sch.adminToken);
    expect((await reg(reset.body.code, 'u5@x.in')).status).toBe(404);
    // school_admin setup code via register -> admin
    const link = await request(ctx.app).post(`/api/admin/schools/${sch.schoolId}/setup-link`).set(adminAuth);
    const adm = await reg(link.body.code, 'u6@x.in');
    expect(adm.status).toBe(201);
    expect(adm.body.teacher.role).toBe('school_admin');
    expect((await reg(link.body.code, 'u7@x.in')).status).toBe(404);
  });

  it('409 on a duplicate email without using up the invite', async () => {
    const sch = await makeSchool(ctx.app);
    const limited = await post('/api/school/invites', { maxUses: 1 }, sch.adminToken);
    const dup = await post('/api/auth/teacher/register', { inviteCode: limited.body.code, name: 'T', email: sch.adminEmail.toUpperCase(), password: 'password1' });
    expect(dup.status).toBe(409);
    expect((await post('/api/auth/teacher/register', { inviteCode: limited.body.code, name: 'T', email: 'fresh@x.in', password: 'password1' })).status).toBe(201);
  });

  it('two simultaneous joins with a one-use invite: exactly one wins', async () => {
    const sch = await makeSchool(ctx.app);
    const limited = await post('/api/school/invites', { maxUses: 1 }, sch.adminToken);
    const reg = (email: string) => post('/api/auth/teacher/register', { inviteCode: limited.body.code, name: 'T', email, password: 'password1' });
    const rs = await Promise.all([reg('r1@x.in'), reg('r2@x.in'), reg('r3@x.in')]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 404, 404]);
  });

  it('turned-off teachers cannot log in (403) and their tokens die; reactivation restores access', async () => {
    const sch = await makeSchool(ctx.app);
    const t = await registerTeacher(ctx.app, 'off@x.in', sch);
    const id = (await ctx.db.get<{ id: number }>("SELECT id FROM teachers WHERE email = 'off@x.in'"))!.id;
    expect((await get('/api/classes', t)).status).toBe(200);
    const off = await patch(`/api/school/teachers/${id}`, { active: false }, sch.adminToken);
    expect(off.body).toMatchObject({ active: false });
    expect((await get('/api/classes', t)).status).toBe(401);
    const login = await post('/api/auth/teacher/login', { email: 'off@x.in', password: 'password1' });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toBe('Your account is turned off. Ask your school admin.');
    expect((await post('/api/auth/teacher/login', { email: 'off@x.in', password: 'wrong-wrong' })).status).toBe(401); // no leak either way
    await patch(`/api/school/teachers/${id}`, { active: true }, sch.adminToken);
    expect((await post('/api/auth/teacher/login', { email: 'off@x.in', password: 'password1' })).status).toBe(200);
  });
});

describe('school admin: invites, teachers, reset links', () => {
  it('a new teacher invite revokes the previous live ones; history keeps them; revoking is idempotent', async () => {
    const sch = await makeSchool(ctx.app);
    const first = (await get('/api/school', sch.adminToken)).body.teacherInvite;
    const second = await post('/api/school/invites', { expiresInDays: 90 }, sch.adminToken);
    expect(second.status).toBe(201);
    expect(second.body.whatsappText).toContain(second.body.url);
    expect(second.body.whatsappText).toContain(second.body.code);
    expect(((Date.parse(second.body.expiresAt) - Date.now()) / 86_400_000)).toBeGreaterThan(89.9);
    expect((await get(`/api/invites/${first.code}`)).status).toBe(404);
    expect((await get(`/api/invites/${second.body.code}`)).status).toBe(200);
    const list = await get('/api/school/invites', sch.adminToken);
    expect(list.body.map((i: { id: number }) => i.id)).toEqual([second.body.id, first.id]);
    expect(list.body[1].revokedAt).not.toBeNull();
    expect((await get('/api/school', sch.adminToken)).body.teacherInvite.id).toBe(second.body.id);
    const del = () => request(ctx.app).delete(`/api/school/invites/${second.body.id}`).set(auth(sch.adminToken));
    expect((await del()).status).toBe(204);
    expect((await del()).status).toBe(204);
    expect((await get('/api/school', sch.adminToken)).body.teacherInvite).toBeNull();
    for (const bad of [{ expiresInDays: 0 }, { expiresInDays: 91 }, { expiresInDays: 1.5 }, { maxUses: 0 }]) {
      expect((await post('/api/school/invites', bad, sch.adminToken)).status).toBe(400);
    }
    expect((await post('/api/school/invites', { maxUses: null }, sch.adminToken)).status).toBe(201);
  });

  it('promotes and demotes, and always keeps one active admin (409)', async () => {
    const sch = await makeSchool(ctx.app);
    const t = await registerTeacher(ctx.app, 'tt@x.in', sch);
    const rows = (await get('/api/school/teachers', sch.adminToken)).body;
    const adminId = rows[0].id;
    const tId = rows[1].id;
    expect(rows.map((r: { role: string }) => r.role)).toEqual(['school_admin', 'teacher']);
    expect(rows[0]).toMatchObject({ classCount: 0, active: true });
    for (const body of [{ role: 'teacher' }, { active: false }, { role: 'teacher', active: false }]) {
      const r = await patch(`/api/school/teachers/${adminId}`, body, sch.adminToken);
      expect(r.status).toBe(409);
      expect(r.body.error.message).toBe('Your school needs at least one admin.');
    }
    expect((await patch(`/api/school/teachers/${tId}`, { role: 'banana' }, sch.adminToken)).status).toBe(400);
    const promo = await patch(`/api/school/teachers/${tId}`, { role: 'school_admin' }, sch.adminToken);
    expect(promo.body.role).toBe('school_admin');
    expect((await get('/api/school', t)).status).toBe(200); // the existing token is now an admin token
    // now the original admin may step down
    expect((await patch(`/api/school/teachers/${adminId}`, { role: 'teacher' }, sch.adminToken)).status).toBe(200);
    expect((await get('/api/school', sch.adminToken)).status).toBe(403);
    // the last admin (t) cannot turn themselves off or demote
    expect((await patch(`/api/school/teachers/${tId}`, { active: false }, t)).status).toBe(409);
    const actions = (await ctx.db.all<{ action: string }>('SELECT action FROM audit_log WHERE school_id = ? AND action LIKE ?', [sch.schoolId, 'teacher.role%'])).length;
    expect(actions).toBe(2);
  });

  it('reset link: single use, 24 hours, revokes older links, signs the teacher out everywhere, not for yourself', async () => {
    const sch = await makeSchool(ctx.app);
    const t = await registerTeacher(ctx.app, 'forgot@x.in', sch);
    const tId = (await ctx.db.get<{ id: number }>("SELECT id FROM teachers WHERE email = 'forgot@x.in'"))!.id;
    const adminId = (await get('/api/auth/me', sch.adminToken)).body.teacher.id;
    expect((await post(`/api/school/teachers/${adminId}/reset-link`, {}, sch.adminToken)).status).toBe(400);
    expect((await post(`/api/school/teachers/${tId}/reset-link`, {}, t)).status).toBe(403);

    const l1 = await post(`/api/school/teachers/${tId}/reset-link`, {}, sch.adminToken);
    expect(l1.status).toBe(201);
    expect(l1.body).toMatchObject({ kind: 'password_reset', maxUses: 1 });
    expect(l1.body.url).toMatch(/\/r\/[A-HJ-NP-Z2-9]{8}$/);
    expect(l1.body.whatsappText).toContain(l1.body.url);
    const hours = (Date.parse(l1.body.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
    const info = await get(`/api/invites/${l1.body.code}`);
    expect(info.body).toMatchObject({ kind: 'password_reset', schoolName: expect.any(String), teacherName: 'Mrs. Patil' });

    const l2 = await post(`/api/school/teachers/${tId}/reset-link`, {}, sch.adminToken);
    expect((await get(`/api/invites/${l1.body.code}`)).status).toBe(404); // older unused link revoked
    expect((await post('/api/auth/password-reset', { code: l2.body.code, password: 'short' })).status).toBe(400);

    const done = await post('/api/auth/password-reset', { code: l2.body.code, password: 'brand-new-pass' });
    expect(done.status).toBe(200);
    expect(done.body.teacher.email).toBe('forgot@x.in');
    expect((await get('/api/classes', t)).status).toBe(401); // old token deleted
    expect((await get('/api/classes', done.body.token)).status).toBe(200);
    expect((await post('/api/auth/teacher/login', { email: 'forgot@x.in', password: 'password1' })).status).toBe(401);
    expect((await post('/api/auth/teacher/login', { email: 'forgot@x.in', password: 'brand-new-pass' })).status).toBe(200);
    expect((await post('/api/auth/password-reset', { code: l2.body.code, password: 'another-pass-1' })).status).toBe(404); // reused
    // expired link
    const l3 = await post(`/api/school/teachers/${tId}/reset-link`, {}, sch.adminToken);
    await ctx.db.run("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", [l3.body.id]);
    expect((await post('/api/auth/password-reset', { code: l3.body.code, password: 'another-pass-1' })).status).toBe(404);
    // a join code is not a reset code
    expect((await post('/api/auth/password-reset', { code: sch.teacherCode, password: 'another-pass-1' })).status).toBe(404);
    expect((await post('/api/auth/password-reset', { password: 'another-pass-1' })).status).toBe(400);
  });
});

describe('classes: wizard, duplicates, share, rotate, overview', () => {
  it('creates by standard + division, 409 on a duplicate in the school and year, archive frees the slot', async () => {
    const sch = await makeSchool(ctx.app);
    const t1 = await registerTeacher(ctx.app, 'c1@x.in', sch);
    const t2 = await registerTeacher(ctx.app, 'c2@x.in', sch);
    const a = await post('/api/classes', { standard: 5, division: 'b' }, t1);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ name: '5B', standard: 5, division: 'B', academicYear: '2026-27', archived: false, joinEnabled: true, schoolId: sch.schoolId });
    const dup = await post('/api/classes', { standard: 5, division: 'B' }, t2); // other teacher, same school
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('5B already exists');
    expect((await post('/api/classes', { standard: 5, division: 'B', startDate: '2027-06-01' }, t2)).status).toBe(201); // next academic year
    expect((await post('/api/classes', { standard: 5, division: '' }, t2)).body.name).toBe('5');
    expect((await post('/api/classes', { standard: 13 }, t1)).status).toBe(400);
    expect((await post('/api/classes', { standard: 5, division: 'TOOLONG' }, t1)).status).toBe(400);
    expect((await post('/api/classes', { standard: 5, division: 'a-' }, t1)).status).toBe(400);
    expect((await post('/api/classes', {}, t1)).status).toBe(400);
    // legacy { name } is parsed
    const legacy = await post('/api/classes', { name: '6 c' }, t1);
    expect(legacy.body).toMatchObject({ standard: 6, division: 'C', name: '6 c' });
    // unparseable legacy names fall back to standard 5 with no division, which already exists here
    expect((await post('/api/classes', { name: 'Morning batch' }, t1)).status).toBe(409);

    expect((await patch(`/api/classes/${a.body.id}`, { archived: true }, t1)).body.archived).toBe(true);
    expect((await get('/api/classes', t1)).body.map((c: { id: number }) => c.id)).not.toContain(a.body.id);
    expect((await get('/api/classes?archived=1', t1)).body.map((c: { id: number }) => c.id)).toContain(a.body.id);
    const re = await post('/api/classes', { standard: 5, division: 'B' }, t2);
    expect(re.status).toBe(201);
    // un-archiving now clashes
    expect((await patch(`/api/classes/${a.body.id}`, { archived: false }, t1)).status).toBe(409);
    const audits = (await ctx.db.all<{ action: string }>("SELECT action FROM audit_log WHERE action LIKE 'class.%' AND school_id = ?", [sch.schoolId])).map((r) => r.action);
    expect(audits).toContain('class.create');
    expect(audits).toContain('class.archive');
  });

  it('validates class patches and toggles join', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t);
    expect((await patch(`/api/classes/${cls.id}`, { joinEnabled: 'yes' }, t)).status).toBe(400);
    expect((await patch(`/api/classes/${cls.id}`, { linkShared: false }, t)).status).toBe(400);
    const off = await patch(`/api/classes/${cls.id}`, { joinEnabled: false }, t);
    expect(off.body.joinEnabled).toBe(false);
    expect((await get(`/api/join/class/${cls.classCode}`)).status).toBe(404);
    expect((await patch(`/api/classes/${cls.id}`, { joinEnabled: true }, t)).body.joinEnabled).toBe(true);
    expect((await get(`/api/join/class/${cls.classCode}`)).status).toBe(200);
  });

  it('rotate-code: the old code stops working for new logins, existing tokens keep working', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const st = await studentLogin(ctx.app, cls, students[0]!);
    const r = await post(`/api/classes/${cls.id}/rotate-code`, {}, t);
    expect(r.status).toBe(200);
    expect(r.body.classCode).not.toBe(cls.classCode);
    expect(r.body.classCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect((await get(`/api/join/class/${cls.classCode}`)).status).toBe(404);
    expect((await post('/api/auth/student/login', { classCode: cls.classCode, studentId: students[1]!.id, pin: students[1]!.pin })).status).toBe(404);
    expect((await post('/api/auth/student/login', { classCode: r.body.classCode, studentId: students[1]!.id, pin: students[1]!.pin })).status).toBe(200);
    expect((await get('/api/student/home', st)).status).toBe(200);
    expect((await ctx.db.get('SELECT 1 FROM audit_log WHERE action = ?', ['class.code_rotate']))).toBeDefined();
  });

  it('share info: absolute URLs and the WhatsApp text without any PIN', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const r = await request(ctx.app).get(`/api/classes/${cls.id}/share`).set(auth(t)).set('x-forwarded-proto', 'https').set('x-forwarded-host', 'app.test');
    expect(r.status).toBe(200);
    expect(r.body.joinUrl).toBe(`https://app.test/j/${cls.classCode}`);
    expect(r.body.classCode).toBe(cls.classCode);
    expect(r.body.schoolJoinUrl).toMatch(/^https:\/\/app\.test\/s\/[A-HJ-NP-Z2-9]{6}$/);
    expect(r.body.whatsappText).toContain(r.body.joinUrl);
    expect(r.body.whatsappText).toContain('Class 5A');
    for (const s of students) expect(r.body.whatsappText).not.toContain(s.pin);
  });

  it('students: first name only, 100 per request, consent attestation, audit without names', async () => {
    const t = await registerTeacher(ctx.app);
    const c = await post('/api/classes', { standard: 5, division: 'A' }, t);
    const add = await post(`/api/classes/${c.body.id}/students`, { students: [{ rollNo: 7, firstName: ' Riya   Patil ' }, { rollNo: 8, firstName: 'Aarav' }], consentConfirmed: true }, t);
    expect(add.status).toBe(201);
    expect(add.body[0].firstName).toBe('Riya');
    const row = await ctx.db.get<{ consent_attested_at: string | null; consent_attested_by: number | null }>('SELECT * FROM classes WHERE id = ?', [c.body.id]);
    expect(row!.consent_attested_at).not.toBeNull();
    expect(row!.consent_attested_by).not.toBeNull();
    const first = row!.consent_attested_at;
    await post(`/api/classes/${c.body.id}/students`, { students: [{ rollNo: 9, firstName: 'Om' }], consentConfirmed: true }, t);
    expect((await ctx.db.get<{ consent_attested_at: string }>('SELECT consent_attested_at FROM classes WHERE id = ?', [c.body.id]))!.consent_attested_at).toBe(first);
    expect((await patch(`/api/students/${add.body[1].id}`, { firstName: 'Aarav Kumar' }, t)).body.firstName).toBe('Aarav');
    expect((await post(`/api/classes/${c.body.id}/students`, { students: [{ rollNo: 10, firstName: 'X' }], consentConfirmed: 'yes' }, t)).status).toBe(400);
    const meta = await ctx.db.all<{ meta_json: string }>("SELECT meta_json FROM audit_log WHERE action = 'students.add'");
    expect(meta.map((m) => JSON.parse(m.meta_json))).toEqual([{ count: 2 }, { count: 1 }]);
  });

  it('teacher overview: checklist advances as the class fills and children join', async () => {
    const sch = await makeSchool(ctx.app);
    const t = await registerTeacher(ctx.app, 'ov@x.in', sch);
    const ov = async () => (await get('/api/teacher/overview', t)).body;
    let o = await ov();
    expect(o.checklist).toEqual({ classCreated: false, studentsAdded: false, linkShared: false, firstStudentJoined: false, done: false });
    expect(o).toMatchObject({ date: '2026-11-20', classes: [], teacher: { email: 'ov@x.in', role: 'teacher' }, school: { id: sch.schoolId } });
    const c = await post('/api/classes', { standard: 5, division: 'A' }, t);
    o = await ov();
    expect(o.checklist).toMatchObject({ classCreated: true, studentsAdded: false });
    const added = await post(`/api/classes/${c.body.id}/students`, { students: [1, 2, 3].map((n) => ({ rollNo: n, firstName: `S${n}` })) }, t);
    o = await ov();
    expect(o.checklist).toMatchObject({ studentsAdded: true, linkShared: false });
    expect(o.classes[0]).toMatchObject({ studentCount: 3, joinedCount: 0, completedToday: 0, teacherName: 'Mrs. Patil' });
    await patch(`/api/classes/${c.body.id}`, { linkShared: true }, t);
    expect((await ov()).checklist).toMatchObject({ linkShared: true, firstStudentJoined: false, done: false });
    await studentLogin(ctx.app, c.body, added.body[0]);
    o = await ov();
    expect(o.checklist).toEqual({ classCreated: true, studentsAdded: true, linkShared: true, firstStudentJoined: true, done: true });
    expect(o.classes[0].joinedCount).toBe(1);
    expect((await request(ctx.app).get('/api/teacher/overview')).status).toBe(401);
  });
});

describe('student join, PINs and shared devices', () => {
  it('class join lists active students by name with avatar and roll only; case-insensitive; same 404 for every dead end', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t, ['Riya', 'Aarav', 'Kabir', 'Riya']);
    await patch(`/api/students/${students[2]!.id}`, { active: false }, t);
    const r = await get(`/api/join/class/${cls.classCode.toLowerCase()}`);
    expect(r.status).toBe(200);
    expect(r.body.classRoom).toEqual({ name: '5A', classCode: cls.classCode });
    expect(r.body.schoolName).toContain('School');
    expect(r.body.students.map((s: { firstName: string; rollNo: number }) => `${s.firstName}${s.rollNo}`)).toEqual(['Aarav2', 'Riya1', 'Riya4']);
    expect(Object.keys(r.body.students[0]).sort()).toEqual(['avatar', 'firstName', 'id', 'rollNo']);
    expect(JSON.stringify(r.body)).not.toMatch(new RegExp(students.map((s) => `"${s.pin}"`).join('|')));

    const dead = new Set<string>();
    dead.add(JSON.stringify((await get('/api/join/class/ZZZZZZ')).body));
    await patch(`/api/classes/${cls.id}`, { archived: true }, t);
    const arch = await get(`/api/join/class/${cls.classCode}`);
    expect(arch.status).toBe(404);
    dead.add(JSON.stringify(arch.body));
    expect(dead.size).toBe(1);
  });

  it('legacy class codes (not in the new alphabet) are looked up as typed', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    await ctx.db.run("UPDATE classes SET class_code = 'DEMO5A' WHERE id = ?", [cls.id]);
    expect((await get('/api/join/class/demo5a')).status).toBe(200);
    const login = await post('/api/auth/student/login', { classCode: 'demo5a', studentId: students[0]!.id, pin: students[0]!.pin });
    expect(login.status).toBe(200);
    expect(login.body.classCode).toBe('DEMO5A');
  });

  it('school link lists joinable classes in standard order', async () => {
    const sch = await makeSchool(ctx.app, 'Link School');
    const t = await registerTeacher(ctx.app, 'ls@x.in', sch);
    const c6 = await post('/api/classes', { standard: 6, division: 'A' }, t);
    const c5b = await post('/api/classes', { standard: 5, division: 'B' }, t);
    const c5a = await post('/api/classes', { standard: 5, division: 'A' }, t);
    const off = await post('/api/classes', { standard: 7, division: 'A' }, t);
    await patch(`/api/classes/${off.body.id}`, { joinEnabled: false }, t);
    const gone = await post('/api/classes', { standard: 8, division: 'A' }, t);
    await patch(`/api/classes/${gone.body.id}`, { archived: true }, t);
    const r = await get(`/api/join/school/${sch.studentCode.toLowerCase()}`);
    expect(r.status).toBe(200);
    expect(r.body.schoolName).toBe('Link School');
    expect(r.body.classes.map((c: { name: string }) => c.name)).toEqual(['5A', '5B', '6A']);
    expect(r.body.classes[0]).toEqual({ name: '5A', classCode: c5a.body.classCode, standard: 5, division: 'A' });
    void c6; void c5b;
    expect((await get('/api/join/school/ZZZZZZ')).status).toBe(404);
  });

  it('student login reports firstLogin once, with schoolName and classCode; sets first/last login', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const login = () => post('/api/auth/student/login', { classCode: cls.classCode, studentId: students[0]!.id, pin: students[0]!.pin });
    const a = await login();
    expect(a.body).toMatchObject({ firstLogin: true, classCode: cls.classCode, className: '5A', schoolName: expect.stringContaining('School') });
    const b = await login();
    expect(b.body.firstLogin).toBe(false);
    const roster = (await get(`/api/classes/${cls.id}/students`, t)).body;
    expect(roster[0].firstLoginAt).not.toBeNull();
    expect(roster[0].lastLoginAt).not.toBeNull();
    expect(roster[1]).toMatchObject({ firstLoginAt: null, locked: false });
    expect((await get(`/api/classes/${cls.id}/students`, t)).body[0].pin).toBeDefined(); // teachers see PINs
  });

  it('a disabled join link blocks new logins only; existing tokens keep working', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const tok = await studentLogin(ctx.app, cls, students[0]!);
    await patch(`/api/classes/${cls.id}`, { joinEnabled: false }, t);
    expect((await post('/api/auth/student/login', { classCode: cls.classCode, studentId: students[1]!.id, pin: students[1]!.pin })).status).toBe(404);
    expect((await get('/api/student/home', tok)).status).toBe(200);
    // archiving the class does lock existing tokens
    await patch(`/api/classes/${cls.id}`, { archived: true }, t);
    expect((await get('/api/student/home', tok)).status).toBe(401);
  });

  it('shared device: several children on one phone each hold their own working token', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t, ['Riya', 'Aarav', 'Kabir']);
    const tokens = await Promise.all(students.map((s) => studentLogin(ctx.app, cls, s)));
    expect(new Set(tokens).size).toBe(3);
    for (let i = 0; i < 3; i++) {
      const me = await get('/api/auth/me', tokens[i]!);
      expect(me.body).toMatchObject({ role: 'student', student: { id: students[i]!.id, firstName: students[i]!.firstName } });
      expect((await get('/api/student/home', tokens[i]!)).status).toBe(200);
    }
    // the same child logging in again on a second phone adds a token, the first still works
    const second = await studentLogin(ctx.app, cls, students[0]!);
    expect(second).not.toBe(tokens[0]);
    expect((await get('/api/student/home', tokens[0]!)).status).toBe(200);
    // removing one profile (logout) does not touch the others
    expect((await post('/api/auth/logout', {}, tokens[1]!)).status).toBe(204);
    expect((await get('/api/student/home', tokens[1]!)).status).toBe(401);
    expect((await get('/api/student/home', tokens[2]!)).status).toBe(200);
  });

  it('reset PIN signs the child out on every phone (default), clears the lock, and can keep devices', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t, ['Riya', 'Aarav']);
    const riya = students[0]!;
    const phone1 = await studentLogin(ctx.app, cls, riya);
    const phone2 = await studentLogin(ctx.app, cls, riya);
    const other = await studentLogin(ctx.app, cls, students[1]!);
    const wrong = riya.pin === '9999' ? '9998' : '9999';
    for (let i = 0; i < 5; i++) await post('/api/auth/student/login', { classCode: cls.classCode, studentId: riya.id, pin: wrong });
    expect((await get(`/api/classes/${cls.id}/students`, t)).body[0].locked).toBe(true);

    const keep = await post(`/api/students/${riya.id}/reset-pin`, { signOutDevices: false }, t);
    expect(keep.body.locked).toBe(false);
    expect((await get('/api/student/home', phone1)).status).toBe(200);
    const reset = await post(`/api/students/${riya.id}/reset-pin`, {}, t);
    expect(reset.status).toBe(200);
    expect(reset.body.pin).toMatch(/^\d{4}$/);
    expect((await get('/api/student/home', phone1)).status).toBe(401);
    expect((await get('/api/student/home', phone2)).status).toBe(401);
    expect((await get('/api/student/home', other)).status).toBe(200);
    expect((await post(`/api/students/${riya.id}/reset-pin`, { signOutDevices: 'no' }, t)).status).toBe(400);
    const ok = await post('/api/auth/student/login', { classCode: cls.classCode, studentId: riya.id, pin: reset.body.pin });
    expect(ok.status).toBe(200);
    expect(ok.body.firstLogin).toBe(false);
    const acts = (await ctx.db.all<{ action: string }>("SELECT action FROM audit_log WHERE action IN ('student.pin_reset','student.lockout')")).map((a) => a.action);
    expect(acts.filter((a) => a === 'student.pin_reset')).toHaveLength(2);
    expect(acts).toContain('student.lockout');
  });

  it('turning a student off deletes their tokens and blocks login; idempotent re-run records one audit row', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const tok = await studentLogin(ctx.app, cls, students[0]!);
    await patch(`/api/students/${students[0]!.id}`, { active: false }, t);
    await patch(`/api/students/${students[0]!.id}`, { active: false }, t);
    expect((await ctx.db.get('SELECT 1 FROM auth_tokens WHERE token = ?', [tok]))).toBeUndefined();
    expect((await post('/api/auth/student/login', { classCode: cls.classCode, studentId: students[0]!.id, pin: students[0]!.pin })).status).toBe(404);
    expect((await ctx.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE action = 'student.deactivate'"))!.n).toBe(1);
  });

  it('legacy roster alias keeps its shape and the same 404 rules', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t);
    await patch(`/api/classes/${cls.id}`, { joinEnabled: false }, t);
    expect((await get(`/api/auth/classes/${cls.classCode}/roster`)).status).toBe(404);
    await patch(`/api/classes/${cls.id}`, { joinEnabled: true }, t);
    expect((await get(`/api/auth/classes/${cls.classCode}/roster`)).body.className).toBe('5A');
  });
});

describe('token sliding expiry', () => {
  it('renews a stale token once (7 days teacher, 60 days student) and not again within a day', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls, students } = await makeClass(ctx.app, t);
    const st = await studentLogin(ctx.app, cls, students[0]!);
    const read = async (tok: string) => (await ctx.db.get<{ expires_at: string; last_used_at: string | null }>('SELECT expires_at, last_used_at FROM auth_tokens WHERE token = ?', [tok]))!;

    // a fresh token is not rewritten
    const before = await read(st);
    await get('/api/student/home', st);
    expect(await read(st)).toEqual(before);

    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await ctx.db.run('UPDATE auth_tokens SET last_used_at = ?, expires_at = ? WHERE token = ?', [old, new Date(Date.now() + 5_000).toISOString(), st]);
    await get('/api/student/home', st);
    const renewed = await read(st);
    expect(Date.parse(renewed.last_used_at!)).toBeGreaterThan(Date.now() - 5_000);
    expect((Date.parse(renewed.expires_at) - Date.now()) / 86_400_000).toBeGreaterThan(59.9);
    await get('/api/student/home', st);
    expect(await read(st)).toEqual(renewed); // at most one write per day
    expect((await ctx.db.get<{ last_login_at: string }>('SELECT last_login_at FROM students WHERE id = ?', [students[0]!.id]))!.last_login_at).toBe(renewed.last_used_at);

    await ctx.db.run('UPDATE auth_tokens SET last_used_at = NULL, expires_at = ? WHERE token = ?', [new Date(Date.now() + 5_000).toISOString(), t]);
    await get('/api/classes', t);
    const tr = await read(t);
    expect(tr.last_used_at).not.toBeNull();
    const days = (Date.parse(tr.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });
});

describe('school dashboard endpoints', () => {
  const session = (studentId: number, classId: number, date: string) =>
    ctx.db.run(
      "INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, completed_at, scoring_version) VALUES (?, ?, ?, 1, '[]', ?, 'v1')",
      [studentId, classId, date, `${date}T10:00:00.000Z`],
    );

  it('GET/PATCH /school, checklist progression, rotate student code, audit feed', async () => {
    const sch = await makeSchool(ctx.app, 'Dash School');
    const info = await get('/api/school', sch.adminToken);
    expect(info.body.school).toMatchObject({ name: 'Dash School', district: 'Thane', studentCode: sch.studentCode, status: 'active' });
    expect(info.body.studentJoinUrl).toMatch(new RegExp(`/s/${sch.studentCode}$`));

    expect((await patch('/api/school', { name: '' }, sch.adminToken)).status).toBe(400);
    expect((await patch('/api/school', { teacherLinkShared: false }, sch.adminToken)).status).toBe(400);
    const up = await patch('/api/school', { name: 'Renamed School', district: 'Pune', teacherLinkShared: true }, sch.adminToken);
    expect(up.body.school).toMatchObject({ name: 'Renamed School', district: 'Pune' });
    expect(up.body.checklist.teacherLinkShared).toBe(true);

    const t = await registerTeacher(ctx.app, 'dash-t@x.in', sch);
    const { cls, students } = await makeClass(ctx.app, t);
    expect((await get('/api/school', sch.adminToken)).body.checklist).toMatchObject({ firstTeacherJoined: true, firstClassCreated: true, firstStudentPlayed: false, done: false });
    await session(students[0]!.id, cls.id, '2026-11-20');
    expect((await get('/api/school', sch.adminToken)).body.checklist.done).toBe(true);

    const rot = await post('/api/school/rotate-student-code', {}, sch.adminToken);
    expect(rot.body.school.studentCode).not.toBe(sch.studentCode);
    expect((await get(`/api/join/school/${sch.studentCode}`)).status).toBe(404);
    expect((await get(`/api/join/school/${rot.body.school.studentCode}`)).status).toBe(200);

    const feed = await get('/api/school/audit', sch.adminToken);
    expect(feed.status).toBe(200);
    const actions = feed.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['school.update', 'school.student_code_rotate', 'class.create', 'students.add', 'teacher.join']));
    expect(feed.body[0].id).toBeGreaterThan(feed.body[feed.body.length - 1].id); // newest first
    const create = feed.body.find((e: { action: string }) => e.action === 'class.create');
    expect(create).toMatchObject({ actorType: 'teacher', actorName: 'Mrs. Patil', targetType: 'class', targetLabel: '5A' });
    // paging
    const page1 = await get('/api/school/audit?limit=2', sch.adminToken);
    expect(page1.body).toHaveLength(2);
    const page2 = await get(`/api/school/audit?limit=2&before=${page1.body[1].id}`, sch.adminToken);
    expect(page2.body[0].id).toBeLessThan(page1.body[1].id);
    expect((await get('/api/school/audit?limit=0', sch.adminToken)).status).toBe(400);
    expect((await get('/api/school/audit?before=abc', sch.adminToken)).status).toBe(400);
  });

  it('audit rows hold ids only: no names, emails or PINs anywhere in meta_json', async () => {
    const sch = await makeSchool(ctx.app, 'Private School');
    const t = await registerTeacher(ctx.app, 'secret-teacher@x.in', sch);
    const { cls, students } = await makeClass(ctx.app, t, ['Riya', 'Aarav']);
    await post(`/api/students/${students[0]!.id}/reset-pin`, {}, t);
    await patch(`/api/students/${students[1]!.id}`, { active: false }, t);
    await patch(`/api/classes/${cls.id}`, { joinEnabled: false }, t);
    const rows = await ctx.db.all<{ meta_json: string; action: string }>('SELECT * FROM audit_log');
    expect(rows.length).toBeGreaterThan(8);
    const blob = JSON.stringify(rows);
    for (const bad of ['Riya', 'Aarav', 'Mrs. Patil', 'secret-teacher', '@x.in', ...students.map((s) => `"pin":"${s.pin}"`)]) expect(blob).not.toContain(bad);
    for (const r of rows) expect(() => JSON.parse(r.meta_json)).not.toThrow();
  });

  it('overview: totals, per-class rows, week completion %, archived excluded, date param', async () => {
    const sch = await makeSchool(ctx.app);
    const t = await registerTeacher(ctx.app, 'ov1@x.in', sch);
    const t2 = await registerTeacher(ctx.app, 'ov2@x.in', sch);
    const a = await makeClass(ctx.app, t, ['A1', 'A2', 'A3', 'A4']);
    const b = await makeClass(ctx.app, t2, ['B1', 'B2'], undefined, 'B');
    const gone = await makeClass(ctx.app, t2, ['G1'], undefined, 'C');
    await patch(`/api/classes/${gone.cls.id}`, { archived: true }, t2);
    await studentLogin(ctx.app, a.cls, a.students[0]!);
    await studentLogin(ctx.app, a.cls, a.students[1]!);
    // Friday 2026-11-20: week Mon 16..Fri 20 = 5 weekdays. Class A: 4 students * 5 = 20 slots; give 5 sessions -> 25%
    await session(a.students[0]!.id, a.cls.id, '2026-11-20');
    for (const d of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']) await session(a.students[1]!.id, a.cls.id, d);
    await session(a.students[2]!.id, a.cls.id, '2026-11-09'); // last week: not counted
    await session(b.students[0]!.id, b.cls.id, '2026-11-20');

    const r = await get('/api/school/overview', sch.adminToken);
    expect(r.status).toBe(200);
    expect(r.body.date).toBe('2026-11-20');
    expect(r.body.totals).toEqual({ teachers: 3, classes: 2, students: 6, joined: 2, completedToday: 2 });
    const rowA = r.body.classes.find((c: { classId: number }) => c.classId === a.cls.id);
    expect(rowA).toMatchObject({ name: '5A', standard: 5, division: 'A', teacherName: 'Mrs. Patil', teacherActive: true, studentCount: 4, joinedCount: 2, completedToday: 1, weekCompletionPct: 25 });
    const rowB = r.body.classes.find((c: { classId: number }) => c.classId === b.cls.id);
    expect(rowB).toMatchObject({ studentCount: 2, joinedCount: 0, completedToday: 1, weekCompletionPct: 10 });
    expect(r.body.classes.map((c: { classId: number }) => c.classId)).not.toContain(gone.cls.id);
    // Monday 2026-11-16: 1 weekday so far
    const mon = await get('/api/school/overview?date=2026-11-16', sch.adminToken);
    expect(mon.body.classes.find((c: { classId: number }) => c.classId === a.cls.id)).toMatchObject({ completedToday: 1, weekCompletionPct: 25 }); // 1 session / (4 * 1)
    expect((await get('/api/school/overview?date=nope', sch.adminToken)).status).toBe(400);
  });

  it('classes: list, reassign to an active teacher of the school, archive, validation', async () => {
    const sch = await makeSchool(ctx.app);
    const t1 = await registerTeacher(ctx.app, 'r1@x.in', sch);
    const t2 = await registerTeacher(ctx.app, 'r2@x.in', sch);
    const t2Id = (await get('/api/auth/me', t2)).body.teacher.id;
    const { cls } = await makeClass(ctx.app, t1);
    const list = await get('/api/school/classes', sch.adminToken);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: cls.id, teacherName: 'Mrs. Patil', studentCount: 3 });

    expect((await patch(`/api/school/classes/${cls.id}`, { teacherId: 9999 }, sch.adminToken)).status).toBe(400);
    const re = await patch(`/api/school/classes/${cls.id}`, { teacherId: t2Id }, sch.adminToken);
    expect(re.status).toBe(200);
    expect(re.body.teacherId).toBe(t2Id);
    expect((await get(`/api/classes/${cls.id}/students`, t1)).status).toBe(404); // the old teacher lost access
    expect((await get(`/api/classes/${cls.id}/students`, t2)).status).toBe(200);
    const off = await patch(`/api/school/teachers/${t2Id}`, { active: false }, sch.adminToken);
    expect(off.body.active).toBe(false);
    expect((await patch(`/api/school/classes/${cls.id}`, { teacherId: t2Id }, sch.adminToken)).status).toBe(400); // inactive
    const ov = await get('/api/school/overview', sch.adminToken);
    expect(ov.body.classes[0].teacherActive).toBe(false); // "needs a teacher"
    expect((await patch(`/api/school/classes/${cls.id}`, { archived: 'x' }, sch.adminToken)).status).toBe(400);
    const arch = await patch(`/api/school/classes/${cls.id}`, { archived: true }, sch.adminToken);
    expect(arch.body.archived).toBe(true);
    expect((await get('/api/school/classes', sch.adminToken)).body).toHaveLength(0);
    expect((await get('/api/school/classes?archived=1', sch.adminToken)).body).toHaveLength(1);
    const acts = (await ctx.db.all<{ action: string }>("SELECT action FROM audit_log WHERE action IN ('class.reassign','class.archive')")).map((a) => a.action);
    expect(acts).toEqual(['class.reassign', 'class.archive']);
  });

  it('an admin sees any class in their school (roster, PIN reset, dashboard) like its teacher', async () => {
    const sch = await makeSchool(ctx.app);
    const t = await registerTeacher(ctx.app, 'own@x.in', sch);
    const { cls, students } = await makeClass(ctx.app, t);
    expect((await get(`/api/classes/${cls.id}/students`, sch.adminToken)).status).toBe(200);
    expect((await get(`/api/classes/${cls.id}/dashboard`, sch.adminToken)).status).toBe(200);
    expect((await post(`/api/students/${students[0]!.id}/reset-pin`, {}, sch.adminToken)).status).toBe(200);
    expect((await get('/api/classes', sch.adminToken)).body).toEqual([]); // /classes stays "my own"
  });
});
