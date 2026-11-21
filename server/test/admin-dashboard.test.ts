import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_SECRET, FAKE_TODAY, adminAuth, auth, finishWords, makeClass, makeSchool, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';

let ctx: Ctx;
beforeEach(async () => { ctx = await setup(); });

const get = (path: string) => request(ctx.app).get(path).set(adminAuth);

/** School A: 3 students, 2 play today (1 finishes the day). One extra session 10 days ago by the third student. School B: idle. */
async function seed() {
  const a = await makeSchool(ctx.app, 'Alpha School');
  const b = await makeSchool(ctx.app, 'Beta School');
  const tok = await registerTeacher(ctx.app, 'alpha@school.in', a);
  const { cls, students } = await makeClass(ctx.app, tok, ['Riya', 'Aarav', 'Kabir']);
  const s1 = await studentLogin(ctx.app, cls, students[0]!);
  const s2 = await studentLogin(ctx.app, cls, students[1]!);
  const sid = await finishWords(ctx.app, s1);
  await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(s1)).send({});
  await request(ctx.app).post('/api/student/sessions/today').set(auth(s2)).send({});
  await ctx.db.run(
    `INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, completed_at, scoring_version) VALUES (?, ?, '2026-11-10', 1, '[]', '2026-11-10T05:00:00.000Z', 'v1')`,
    [students[2]!.id, cls.id],
  );
  return { a, b, cls, students };
}

describe('GET /api/admin/overview', () => {
  it('requires the secret', async () => {
    expect((await request(ctx.app).get('/api/admin/overview')).status).toBe(401);
    const bad = await request(ctx.app).get('/api/admin/overview').set('X-Admin-Secret', 'wrong-secret-1234567890');
    expect(bad.status).toBe(401);
    expect(JSON.stringify(bad.body)).not.toContain(ADMIN_SECRET);
    for (const p of ['/api/admin/activity', '/api/admin/schools/1']) expect((await request(ctx.app).get(p)).status).toBe(401);
  });

  it('is all zeros on an empty platform with a full 30-day series', async () => {
    const r = await get('/api/admin/overview');
    expect(r.status).toBe(200);
    expect(r.body.totals).toMatchObject({ schoolsActive: 0, students: 0, studiesRunning: 0 });
    expect(r.body.activity.studentsToday).toBe(0);
    expect(r.body.daily).toHaveLength(30);
    expect(r.body.daily[29].date).toBe(FAKE_TODAY);
    expect(r.body.topSchools).toEqual([]);
  });

  it('counts seeded data', async () => {
    const { a, b } = await seed();
    await request(ctx.app).patch(`/api/admin/schools/${b.schoolId}`).set(adminAuth).send({ status: 'suspended' });
    const r = await get('/api/admin/overview');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain(ADMIN_SECRET);
    expect(r.body.totals).toMatchObject({ schoolsActive: 1, schoolsSuspended: 1, teachers: 3, classes: 1, students: 3, joinRequestsPending: 0, studiesRunning: 0 });
    expect(r.body.activity).toMatchObject({ studentsToday: 2, students7d: 2, students30d: 3, sessionsCompletedToday: 1, sessionsCompleted7d: 1 });
    expect(r.body.activity.wordsCompleted7d).toBeGreaterThan(0);
    expect(r.body.daily[29]).toMatchObject({ date: FAKE_TODAY, activeStudents: 2, sessionsCompleted: 1 });
    expect(r.body.daily.find((d: { date: string }) => d.date === '2026-11-10')).toMatchObject({ activeStudents: 1, sessionsCompleted: 1 });
    expect(r.body.health).toMatchObject({ db: 'ok', appVersion: expect.any(String) });
    expect(r.body.health.migrationsApplied).toBeGreaterThan(5);
    expect(r.body.health.latestMigration).toBeGreaterThan(5);
    expect(r.body.health.wordsLoaded).toBeGreaterThan(0);
    expect(r.body.topSchools).toEqual([{ schoolId: a.schoolId, name: 'Alpha School', activeStudents7d: 2, students: 3 }]);
  });

  it('counts pending join requests and running studies', async () => {
    const { a, cls } = await seed();
    await ctx.db.run(`INSERT INTO join_requests (class_id, first_name, secret_hash) VALUES (?, 'Mira', 'x')`, [cls.id]);
    await ctx.db.run(`INSERT INTO studies (school_id, name, start_date, status) VALUES (?, 'S', '2026-11-01', 'running')`, [a.schoolId]);
    const r = await get('/api/admin/overview');
    expect(r.body.totals).toMatchObject({ joinRequestsPending: 1, studiesRunning: 1 });
  });
});

describe('GET /api/admin/schools (extended)', () => {
  it('adds activity columns and keeps the old ones', async () => {
    const { a, b } = await seed();
    await ctx.db.run(`INSERT INTO studies (school_id, name, start_date, status) VALUES (?, 'S', '2026-11-01', 'running')`, [a.schoolId]);
    const r = await get('/api/admin/schools');
    const ra = r.body.find((x: { school: { id: number } }) => x.school.id === a.schoolId);
    const rb = r.body.find((x: { school: { id: number } }) => x.school.id === b.schoolId);
    expect(ra).toMatchObject({ teachers: 2, classes: 1, students: 3, activeStudents7d: 2, studyRunning: true });
    expect(ra.lastActivityAt).toMatch(/^2\d{3}-/);
    expect(ra.lastTeacherLoginAt).toMatch(/^2\d{3}-/);
    expect(rb).toMatchObject({ activeStudents7d: 0, lastActivityAt: null, studyRunning: false });
  });
});

describe('GET /api/admin/schools/:id', () => {
  it('returns teachers, classes and recent activity', async () => {
    const { a, cls } = await seed();
    const r = await get(`/api/admin/schools/${a.schoolId}`);
    expect(r.status).toBe(200);
    expect(r.body.row.school.name).toBe('Alpha School');
    expect(r.body.teachers.map((t: { email: string }) => t.email)).toContain('alpha@school.in');
    expect(Object.keys(r.body.teachers[0]).sort()).toEqual(['active', 'email', 'id', 'lastLoginAt', 'name', 'role']);
    expect(r.body.classes).toEqual([{ id: cls.id, name: expect.any(String), classCode: cls.classCode, students: 3, active7d: 2, archived: false }]);
    expect(r.body.recentActivity.length).toBeGreaterThan(0);
    expect(r.body.recentActivity.length).toBeLessThanOrEqual(20);
    expect(r.body.recentActivity.every((e: { schoolId: number }) => e.schoolId === a.schoolId)).toBe(true);
  });
  it('404s for an unknown or malformed school id', async () => {
    expect((await get('/api/admin/schools/99999')).status).toBe(404);
    expect((await get('/api/admin/schools/abc')).status).toBe(404);
  });
});

describe('GET /api/admin/activity', () => {
  it('lists newest first across schools with names and honours limit', async () => {
    await seed();
    const r = await get('/api/admin/activity?limit=3');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(3);
    const all = (await get('/api/admin/activity')).body as { id: number; schoolName: string | null }[];
    expect(all.length).toBeGreaterThan(3);
    expect(all.map((e) => e.id)).toEqual([...all.map((e) => e.id)].sort((x, y) => y - x));
    expect(all.map((e) => e.schoolName)).toEqual(expect.arrayContaining(['Alpha School', 'Beta School']));
    expect((await get('/api/admin/activity?limit=junk')).status).toBe(200);
  });
});

describe('no sensitive data leaks', () => {
  it('never exposes pins, hashes, tokens, passwords, secrets or student names', async () => {
    const { a, students } = await seed();
    const bodies = [
      JSON.stringify((await get('/api/admin/overview')).body),
      JSON.stringify((await get('/api/admin/schools')).body),
      JSON.stringify((await get(`/api/admin/schools/${a.schoolId}`)).body),
      JSON.stringify((await get('/api/admin/activity?limit=200')).body),
    ].join('\n');
    expect(bodies).not.toMatch(/pin|password|token|secret|hash|sentence/i);
    for (const s of students) expect(bodies).not.toContain(s.firstName);
    expect(bodies).not.toContain(ADMIN_SECRET);
  });
});
