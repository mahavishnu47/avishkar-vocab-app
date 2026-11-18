import request from 'supertest';
import type { Express } from 'express';
import type { ClassRoom, StudentWithPin } from '@shabd/core';
import { createApp } from '../src/app.ts';
import { createDb, setDb, type DB } from '../src/db/db.ts';
import { loadWordBank } from '../src/db/seed.ts';

export const FAKE_TODAY = '2026-11-20'; // a Friday; the week starts Monday 2026-11-16

export interface Ctx { app: Express; db: DB }

let shared: DB | null = null;
/** Shared pool against the globalSetup database (DATABASE_URL). */
export function testDb(): DB {
  if (!shared) {
    shared = createDb(process.env.DATABASE_URL!, { max: 5 });
    setDb(shared);
  }
  return shared;
}
export async function closeTestDb(): Promise<void> {
  if (shared) await shared.end();
  shared = null;
}

/** Empty every table, reload the mini word bank, pin "today". */
export async function setup(): Promise<Ctx> {
  console.warn = () => {}; // quiet [seed] notices
  process.env.FAKE_TODAY = FAKE_TODAY;
  delete process.env.TEACHER_INVITE_CODE;
  delete process.env.ANTHROPIC_API_KEY;
  const db = testDb();
  const tables = await db.all<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'");
  await db.exec(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE; ALTER SEQUENCE teacher_word_seq RESTART`);
  await loadWordBank(db, '/nonexistent-content-dir', { allowFixture: true });
  return { app: createApp(), db };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function registerTeacher(app: Express, email = 'patil@school.in'): Promise<string> {
  const r = await request(app).post('/api/auth/teacher/register').send({ name: 'Mrs. Patil', email, password: 'password1' });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token as string;
}

export async function makeClass(app: Express, token: string, names: string[] = ['Riya', 'Aarav', 'Kabir'], startDate?: string) {
  const c = await request(app).post('/api/classes').set(auth(token)).send({ name: '5A', ...(startDate ? { startDate } : {}) });
  if (c.status !== 201) throw new Error(`class failed: ${JSON.stringify(c.body)}`);
  const cls = c.body as ClassRoom;
  const s = await request(app)
    .post(`/api/classes/${cls.id}/students`)
    .set(auth(token))
    .send({ students: names.map((firstName, i) => ({ rollNo: i + 1, firstName })) });
  if (s.status !== 201) throw new Error(`students failed: ${JSON.stringify(s.body)}`);
  return { cls, students: s.body as StudentWithPin[] };
}

export async function studentLogin(app: Express, cls: ClassRoom, st: StudentWithPin): Promise<string> {
  const r = await request(app).post('/api/auth/student/login').send({ classCode: cls.classCode, studentId: st.id, pin: st.pin });
  if (r.status !== 200) throw new Error(`student login failed: ${JSON.stringify(r.body)}`);
  return r.body.token as string;
}
