import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { DB } from '../src/db/db.ts';
import { getStudyForClass, registerResearchTable } from '../src/services/research/study.ts';
import { auth, closeTestDb, makeClass, makeSchool, registerTeacher, setup } from './helpers.ts';

let app: Express;
let db: DB;
beforeEach(async () => { ({ app, db } = await setup()); });
afterAll(closeTestDb);

async function world() {
  const school = await makeSchool(app);
  const t = await registerTeacher(app, 'patil@school.in', school);
  const a = await makeClass(app, t, ['Riya', 'Aarav', 'Kabir'], undefined, 'A');
  const b = await makeClass(app, t, ['Meera', 'Zoya'], undefined, 'B');
  return { school, t, a, b };
}
const create = (token: string, body: object) => request(app).post('/api/studies').set(auth(token)).send(body);

describe('F1 study setup', () => {
  it('creates a study with defaults and attaches intervention and comparison classes with codes', async () => {
    const { t, a, b } = await world();
    const c = await create(t, { name: 'Word-a-Day', classes: [{ classId: a.cls.id, group: 'intervention' }] });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ name: 'Word-a-Day', schoolDays: 20, wordsPerDay: 5, status: 'setup' });
    const id = c.body.id as number;
    const put = await request(app).put(`/api/studies/${id}/classes/${b.cls.id}`).set(auth(t)).send({ group: 'comparison' });
    expect(put.status).toBe(200);
    expect(put.body.classes).toHaveLength(2);
    const p = await request(app).get(`/api/studies/${id}/participants`).set(auth(t));
    expect(p.status).toBe(200);
    expect(p.body.map((x: { studyCode: string }) => x.studyCode)).toEqual(['S01', 'S02', 'S03', 'C01', 'C02']);
    // roll order: roll 1 = S01
    const s01 = p.body.find((x: { studyCode: string }) => x.studyCode === 'S01');
    expect(s01).toMatchObject({ firstName: 'Riya', rollNo: 1, group: 'intervention', consent: 'pending', analysable: false });
    expect(await getStudyForClass(db, a.cls.id)).toMatchObject({ studyId: id, group: 'intervention', schoolDays: 20, status: 'setup' });
    expect(await getStudyForClass(db, b.cls.id)).toMatchObject({ group: 'comparison' });
  });

  it('validates input', async () => {
    const { t, a } = await world();
    expect((await create(t, { name: '' })).status).toBe(400);
    expect((await create(t, { name: 'x', schoolDays: 99 })).status).toBe(400);
    expect((await create(t, { name: 'x', classes: [{ classId: a.cls.id, group: 'other' }] })).status).toBe(400);
    expect((await create(t, { name: 'x', startDate: 'tomorrow' })).status).toBe(400);
    expect((await request(app).get('/api/studies')).status).toBe(401);
  });

  it('a class is in at most one live study', async () => {
    const { t, a } = await world();
    const one = await create(t, { name: 'One', classes: [{ classId: a.cls.id, group: 'intervention' }] });
    const two = await create(t, { name: 'Two', classes: [{ classId: a.cls.id, group: 'comparison' }] });
    expect(two.status).toBe(409);
    await request(app).patch(`/api/studies/${one.body.id}`).set(auth(t)).send({ status: 'closed' });
    expect((await create(t, { name: 'Two', classes: [{ classId: a.cls.id, group: 'comparison' }] })).status).toBe(201);
  });

  it('appends codes for students added later and never reuses or changes codes', async () => {
    const { t, a } = await world();
    const id = (await create(t, { name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body.id as number;
    await request(app).post(`/api/classes/${a.cls.id}/students`).set(auth(t)).send({ students: [{ rollNo: 9, firstName: 'Late' }] });
    const sync = await request(app).post(`/api/studies/${id}/participants/sync`).set(auth(t));
    expect(sync.body.map((x: { studyCode: string; firstName: string }) => `${x.studyCode}:${x.firstName}`)).toEqual(['S01:Riya', 'S02:Aarav', 'S03:Kabir', 'S04:Late']);
    // delete the last student, add another: S04 is not handed out again
    const late = sync.body.find((x: { studyCode: string }) => x.studyCode === 'S04');
    await db.run('DELETE FROM students WHERE id = ?', [late.studentId]);
    await request(app).post(`/api/classes/${a.cls.id}/students`).set(auth(t)).send({ students: [{ rollNo: 10, firstName: 'Newer' }] });
    const again = await request(app).get(`/api/studies/${id}/participants`).set(auth(t));
    expect(again.body.map((x: { studyCode: string }) => x.studyCode)).toEqual(['S01', 'S02', 'S03', 'S05']);
    // deactivated students keep their code
    await db.run('UPDATE students SET active = 0 WHERE id = ?', [a.students[0]!.id]);
    const third = await request(app).get(`/api/studies/${id}/participants`).set(auth(t));
    expect(third.body[0].studyCode).toBe('S01');
  });

  it('changes consent and exclusion; only given and not excluded are analysable', async () => {
    const { t, a } = await world();
    const id = (await create(t, { name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body.id as number;
    const sid = a.students[0]!.id;
    const g = await request(app).patch(`/api/studies/${id}/participants/${sid}`).set(auth(t)).send({ consent: 'given' });
    expect(g.status).toBe(200);
    expect(g.body).toMatchObject({ consent: 'given', analysable: true });
    expect(g.body.consentUpdatedAt).toBeTruthy();
    const ex = await request(app).patch(`/api/studies/${id}/participants/${sid}`).set(auth(t)).send({ excluded: true });
    expect(ex.body).toMatchObject({ consent: 'given', excluded: true, analysable: false });
    expect((await request(app).patch(`/api/studies/${id}/participants/${sid}`).set(auth(t)).send({ consent: 'maybe' })).status).toBe(400);
    expect((await request(app).patch(`/api/studies/${id}/participants/${sid}`).set(auth(t)).send({})).status).toBe(400);
    const study = await request(app).get(`/api/studies/${id}`).set(auth(t));
    expect(study.body.consent).toMatchObject({ total: 3, given: 1, pending: 2, excluded: 1, analysable: 0 });
  });

  it('hides studies from other schools and from teachers without a class in the study (404)', async () => {
    const { school, t, a, b } = await world();
    const id = (await create(t, { name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body.id as number;
    const other = await registerTeacher(app, 'other@elsewhere.in'); // new school
    expect((await request(app).get(`/api/studies/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(`/api/studies/${id}/participants`).set(auth(other))).status).toBe(404);
    expect((await request(app).patch(`/api/studies/${id}`).set(auth(other)).send({ name: 'hack' })).status).toBe(404);
    expect((await request(app).get('/api/studies').set(auth(other))).body).toEqual([]);
    // a colleague at the same school with no class in the study
    const colleague = await registerTeacher(app, 'rao@school.in', school);
    expect((await request(app).get(`/api/studies/${id}`).set(auth(colleague))).status).toBe(404);
    expect((await request(app).put(`/api/studies/${id}/classes/${b.cls.id}`).set(auth(colleague)).send({ group: 'comparison' })).status).toBe(404);
    // cannot attach someone else's class to own study
    const mine = await create(colleague, { name: 'Mine' });
    expect(mine.status).toBe(201);
    expect((await request(app).put(`/api/studies/${mine.body.id}/classes/${a.cls.id}`).set(auth(colleague)).send({ group: 'comparison' })).status).toBe(404);
    expect((await create(colleague, { name: 'x', classes: [{ classId: a.cls.id, group: 'comparison' }] })).status).toBe(404);
    // the school admin sees everything in the school
    const adm = await request(app).get('/api/studies').set(auth(school.adminToken));
    expect(adm.body.map((s: { id: number }) => s.id).sort()).toEqual([id, mine.body.id].sort());
    expect((await request(app).get(`/api/studies/${id}/participants`).set(auth(school.adminToken))).body).toHaveLength(3);
  });

  it('a teacher whose class is in a study sees only their own participants', async () => {
    const { school, t, a } = await world();
    const rao = await registerTeacher(app, 'rao@school.in', school);
    const c2 = await makeClass(app, rao, ['Dev', 'Esha'], undefined, 'C');
    const id = (await create(t, { name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body.id as number;
    await request(app).put(`/api/studies/${id}/classes/${c2.cls.id}`).set(auth(school.adminToken)).send({ group: 'comparison' });
    const mine = await request(app).get(`/api/studies/${id}/participants`).set(auth(rao));
    expect(mine.body.map((x: { studyCode: string }) => x.studyCode)).toEqual(['C01', 'C02']);
    const st = await request(app).get(`/api/studies/${id}`).set(auth(rao));
    expect(st.body.classes).toHaveLength(1);
    // cannot touch the other class's student
    const r = await request(app).patch(`/api/studies/${id}/participants/${a.students[0]!.id}`).set(auth(rao)).send({ consent: 'given' });
    expect(r.status).toBe(404);
  });

  it('removing a class works only in setup and drops its codes', async () => {
    const { t, a, b } = await world();
    const id = (await create(t, { name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }, { classId: b.cls.id, group: 'comparison' }] })).body.id as number;
    const del = await request(app).delete(`/api/studies/${id}/classes/${b.cls.id}`).set(auth(t));
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/studies/${id}/participants`).set(auth(t))).body).toHaveLength(3);
    await request(app).patch(`/api/studies/${id}`).set(auth(t)).send({ status: 'running' });
    expect((await request(app).delete(`/api/studies/${id}/classes/${a.cls.id}`).set(auth(t))).status).toBe(409);
    // group cannot change once codes exist
    expect((await request(app).put(`/api/studies/${id}/classes/${a.cls.id}`).set(auth(t)).send({ group: 'comparison' })).status).toBe(409);
  });

  it('withdrawal deletes research rows (existing tables only), keeps usage rows, marks withdrawn', async () => {
    const { t, a } = await world();
    const id = (await create(t, { name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body.id as number;
    const sid = a.students[0]!.id;
    const other = a.students[1]!.id;
    await db.exec('CREATE TABLE f1_test_research (id serial PRIMARY KEY, student_id integer NOT NULL)');
    try {
      registerResearchTable('f1_test_research');
      await db.run('INSERT INTO f1_test_research (student_id) VALUES (?), (?), (?)', [sid, sid, other]);
      const w = await request(app).delete(`/api/studies/${id}/participants/${sid}/research-data`).set(auth(t));
      expect(w.status).toBe(200);
      expect(w.body).toMatchObject({ consent: 'withdrawn', analysable: false, studyCode: 'S01' });
      const left = await db.all<{ student_id: number }>('SELECT student_id FROM f1_test_research');
      expect(left.map((r) => r.student_id)).toEqual([other]);
      expect(await db.get('SELECT id FROM students WHERE id = ?', [sid])).toBeTruthy();
    } finally {
      await db.exec('DROP TABLE f1_test_research');
    }
    // also fine when no research table exists
    expect((await request(app).delete(`/api/studies/${id}/participants/${other}/research-data`).set(auth(t))).status).toBe(200);
  });

  it('writes audit entries with ids only (no names, no codes)', async () => {
    const { t, a } = await world();
    const id = (await create(t, { name: 'Secret Study Name', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body.id as number;
    const sid = a.students[0]!.id;
    await request(app).patch(`/api/studies/${id}`).set(auth(t)).send({ name: 'Renamed', status: 'running' });
    await request(app).patch(`/api/studies/${id}/participants/${sid}`).set(auth(t)).send({ consent: 'given' });
    await request(app).delete(`/api/studies/${id}/participants/${sid}/research-data`).set(auth(t));
    const rows = await db.all<{ action: string; meta_json: string }>("SELECT action, meta_json FROM audit_log WHERE action LIKE 'study.%' ORDER BY id");
    expect(rows.map((r) => r.action)).toEqual(['study.create', 'study.update', 'study.consent', 'study.withdraw']);
    const blob = rows.map((r) => r.meta_json).join(' ');
    for (const secret of ['Riya', 'Aarav', 'Secret', 'Renamed', 'S01']) expect(blob).not.toContain(secret);
    expect(JSON.parse(rows[0]!.meta_json)).toMatchObject({ studyId: id });
  });

  it('a closed study keeps the class but getStudyForClass prefers a live one', async () => {
    const { t, a } = await world();
    const id = (await create(t, { name: 'S', classes: [{ classId: a.cls.id, group: 'intervention' }] })).body.id as number;
    await request(app).patch(`/api/studies/${id}`).set(auth(t)).send({ status: 'closed' });
    expect(await getStudyForClass(db, a.cls.id)).toMatchObject({ status: 'closed' });
    const id2 = (await create(t, { name: 'S2', classes: [{ classId: a.cls.id, group: 'comparison' }] })).body.id as number;
    expect(await getStudyForClass(db, a.cls.id)).toMatchObject({ studyId: id2, group: 'comparison' });
    expect(await getStudyForClass(db, 99999)).toBeNull();
  });
});
