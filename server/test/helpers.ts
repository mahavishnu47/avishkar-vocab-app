import request from 'supertest';
import type { Express } from 'express';
import type { ClassRoom, StudentWithPin } from '@shabd/core';
import { createApp } from '../src/app.ts';
import { openDb, setDb, type DB } from '../src/db/db.ts';
import { loadWordBank } from '../src/db/seed.ts';

export const FAKE_TODAY = '2026-11-20'; // a Friday; the week starts Monday 2026-11-16

export interface Ctx { app: Express; db: DB }

/** Fresh in-memory DB + app, word bank from the mini fixture, "today" pinned. */
export function setup(): Ctx {
  console.warn = () => {}; // quiet [seed] notices
  process.env.FAKE_TODAY = FAKE_TODAY;
  delete process.env.TEACHER_INVITE_CODE;
  delete process.env.ANTHROPIC_API_KEY;
  const db = openDb(':memory:');
  setDb(db);
  loadWordBank(db, '/nonexistent-content-dir');
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
