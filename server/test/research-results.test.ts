import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { StudentWithPin, StudyResultsRes } from '@shabd/core';
import { pairedTTest, welchTTest } from '@shabd/core';
import type { DB } from '../src/db/db.ts';
import { auth, closeTestDb, makeClass, makeSchool, registerTeacher, setup } from './helpers.ts';

let app: Express;
let db: DB;
beforeEach(async () => { ({ app, db } = await setup()); });
afterAll(closeTestDb);

const NAMES_I = ['Riya', 'Aarav', 'Kabir', 'Meera', 'Ishaan', 'Tara', 'Vihaan', 'Anaya', 'Rohan', 'Diya', 'Zoya', 'Yash'];
const NAMES_C = ['Neel', 'Pari', 'Omkar', 'Sana', 'Veer'];
const PRE = [10, 12, 8, 15, 9, 11, 13, 7, 14, 10];
const POST = [14, 15, 9, 20, 14, 15, 16, 10, 19, 12];
const C_PRE = [10, 10, 10, 10, 10];
const C_POST = [11, 12, 11, 12, 11];

/** total t (<= 20) split into section A and B; C stays 0 */
const split = (t: number) => ({ a: Math.ceil(t / 2), b: Math.floor(t / 2), c: 0 });

async function paper(t: string, classId: number, kind: 'pre' | 'post', students: StudentWithPin[], totals: number[]) {
  const w = await request(app).post(`/api/classes/${classId}/assessments`).set(auth(t)).send({ kind, mode: 'paper' });
  expect(w.status).toBe(201);
  for (let i = 0; i < totals.length; i++) {
    const r = await request(app).put(`/api/classes/${classId}/assessments/${w.body.id}/students/${students[i]!.id}/manual`).set(auth(t)).send(split(totals[i]!));
    expect(r.status).toBe(200);
  }
}

async function world(withComparison = true) {
  const school = await makeSchool(app);
  const t = await registerTeacher(app, 'patil@school.in', school);
  const a = await makeClass(app, t, NAMES_I, '2026-11-16', 'A');
  const b = withComparison ? await makeClass(app, t, NAMES_C, '2026-11-16', 'B') : null;
  const classes: { classId: number; group: string }[] = [{ classId: a.cls.id, group: 'intervention' }];
  if (b) classes.push({ classId: b.cls.id, group: 'comparison' });
  const study = (await request(app).post('/api/studies').set(auth(t)).send({ name: 'Word-a-Day', startDate: '2026-11-16', classes })).body;
  const parts = (await request(app).get(`/api/studies/${study.id}/participants`).set(auth(t))).body as { studentId: number; studyCode: string; firstName: string }[];
  const consent = async (ids: number[]) => { for (const id of ids) await request(app).patch(`/api/studies/${study.id}/participants/${id}`).set(auth(t)).send({ consent: 'given' }); };
  // Zoya (index 10) stays pending, Yash (index 11) consents but is excluded
  await consent([...a.students.slice(0, 10).map((s) => s.id), a.students[11]!.id, ...(b ? b.students.map((s) => s.id) : [])]);
  await request(app).patch(`/api/studies/${study.id}/participants/${a.students[11]!.id}`).set(auth(t)).send({ excluded: true });
  await paper(t, a.cls.id, 'pre', a.students, [...PRE, 15, 15]);
  await paper(t, a.cls.id, 'post', a.students, [...POST, 20, 20]);
  if (b) {
    await paper(t, b.cls.id, 'pre', b.students, C_PRE);
    await paper(t, b.cls.id, 'post', b.students, C_POST);
  }
  return { school, t, a, b, id: study.id as number, parts };
}

const getResults = async (t: string, id: number) => {
  const r = await request(app).get(`/api/studies/${id}/results`).set(auth(t));
  expect(r.status).toBe(200);
  return r.body as StudyResultsRes;
};
const csv = async (t: string, id: number, type: string) => {
  const r = await request(app).get(`/api/studies/${id}/export.csv?type=${type}`).set(auth(t)).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks).toString('utf8')));
  });
  return r;
};

describe('F8 results', () => {
  it('computes exact means, SD and the paired t-test on consented, non-excluded students only', async () => {
    const { t, id } = await world();
    const res = await getResults(t, id);
    expect(res.counts).toMatchObject({ enrolled: 17, consented: 16, analysable: 15, analysed: 15 });
    expect(res.groupCounts.find((g) => g.group === 'intervention')!.counts).toMatchObject({ enrolled: 12, consented: 11, analysable: 10, analysed: 10, missingPre: 0, missingPost: 0 });
    expect(res.participants).toHaveLength(15);

    const s = res.summary.find((x) => x.group === 'intervention' && x.section === 'total')!;
    expect(s.n).toBe(10);
    expect(s.meanPre).toBe(10.9);
    expect(s.meanPost).toBe(14.4);
    expect(s.meanGain).toBe(3.5);
    expect(s.sdGain).toBeCloseTo(1.354, 3);
    expect(s.pctImprovement).toBeCloseTo(32.11, 2);

    const tt = res.tTests.find((x) => x.group === 'intervention' && x.section === 'total')!.test!;
    const ref = pairedTTest(PRE, POST)!;
    expect(tt.n).toBe(10);
    expect(tt.df).toBe(9);
    expect(tt.t).toBeCloseTo(8.1738, 3); // 3.5 / (1.35401 / sqrt(10))
    expect(tt.t).toBeCloseTo(ref.t, 10);
    expect(tt.p).toBeCloseTo(ref.p, 12);
    expect(tt.p).toBeLessThan(0.001);
    expect(tt.cohenDz).toBeCloseTo(3.5 / 1.354, 2);

    // section C was 0 before and after for everyone: no percentage, no test
    expect(res.summary.find((x) => x.group === 'intervention' && x.section === 'C')!.pctImprovement).toBeNull();
    expect(res.tTests.find((x) => x.group === 'intervention' && x.section === 'C')!.test).toBeNull();

    // nobody outside the analysable set appears
    const codes = res.participants.map((p) => p.studyCode);
    const excludedCode = (await db.get<{ study_code: string }>("SELECT study_code FROM study_participants WHERE study_id = ? AND excluded = 1", [id]))!.study_code;
    const pendingCode = (await db.get<{ study_code: string }>("SELECT study_code FROM study_participants WHERE study_id = ? AND consent = 'pending'", [id]))!.study_code;
    expect(codes).not.toContain(excludedCode);
    expect(codes).not.toContain(pendingCode);
    expect(JSON.stringify(res)).not.toMatch(/Riya|Aarav|Zoya|Yash/);
  });

  it('compares intervention gains with the comparison group using Welch', async () => {
    const { t, id } = await world();
    const res = await getResults(t, id);
    expect(res.hasComparison).toBe(true);
    const row = res.comparison!.find((c) => c.section === 'total')!;
    const gi = POST.map((v, i) => v - PRE[i]!);
    const gc = C_POST.map((v, i) => v - C_PRE[i]!);
    const ref = welchTTest(gi, gc)!;
    expect(row.intervention).toMatchObject({ n: 10, meanGain: 3.5 });
    expect(row.comparison).toMatchObject({ n: 5, meanGain: 1.4 });
    expect(row.welch!.t).toBeCloseTo(ref.t, 10);
    expect(row.welch!.df).toBeCloseTo(ref.df, 10);
    expect(row.welch!.p).toBeCloseTo(ref.p, 12);
    expect(res.tTests.some((x) => x.group === 'comparison')).toBe(true);
  });

  it('has no comparison block without a comparison class, and reports missing tests', async () => {
    const { t, id, a } = await world(false);
    await db.run('DELETE FROM assessment_manual_scores WHERE student_id = ? AND window_id IN (SELECT id FROM assessment_windows WHERE kind = \'post\')', [a.students[0]!.id]);
    const res = await getResults(t, id);
    expect(res.hasComparison).toBe(false);
    expect(res.comparison).toBeNull();
    expect(res.counts).toMatchObject({ analysable: 10, analysed: 9, missingPre: 0, missingPost: 1 });
    expect(res.summary.every((x) => x.group === 'intervention')).toBe(true);
    expect(res.summary.find((x) => x.section === 'total')!.n).toBe(9);
  });

  it('computes participation from completed sessions', async () => {
    const { t, id, a } = await world(false);
    const mk = (sid: number, date: string) => db.run(
      "INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, completed_at, scoring_version) VALUES (?, ?, ?, 1, '[]', '2026-11-20T10:00:00Z', 'v1')",
      [sid, a.cls.id, date]);
    await mk(a.students[0]!.id, '2026-11-16');
    await mk(a.students[0]!.id, '2026-11-17');
    await mk(a.students[1]!.id, '2026-11-16');
    await db.run("INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, scoring_version) VALUES (?, ?, '2026-11-18', 1, '[]', 'v1')", [a.students[2]!.id, a.cls.id]); // not completed
    const res = await getResults(t, id);
    expect(res.participation.studyDaysElapsed).toBe(5); // Mon 16 .. Fri 20 (today)
    expect(res.participation.days[0]).toMatchObject({ dayNo: 1, date: '2026-11-16', completed: 2, of: 10, pct: 20 });
    expect(res.participation.days[1]).toMatchObject({ completed: 1, pct: 10 });
    expect(res.participation.days[2]).toMatchObject({ completed: 0 });
    const first = res.participants.find((p) => p.daysCompleted === 2)!;
    expect(first.completionRate).toBe(0.4);
    expect(res.participation.meanCompletionRate).toBeCloseTo(0.06, 4); // (2 + 1) / 5 / 10
  });
});

describe('F8 export', () => {
  const SECTION_RE = /^﻿?# (\w+)/gm;

  it('never contains first names, roll-number columns or sentence texts, in any export type', async () => {
    const { t, id, a, b } = await world();
    // sentence text and an observation/feedback row exist but must stay out of the exports
    await db.run("INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, completed_at, scoring_version) VALUES (?, ?, '2026-11-16', 1, '[]', '2026-11-16T10:00:00Z', 'v1')", [a.students[0]!.id, a.cls.id]);
    const sid = (await db.get<{ id: number }>('SELECT id FROM sessions LIMIT 1'))!.id;
    const word = (await db.get<{ id: string }>('SELECT id FROM words LIMIT 1'))!.id;
    await db.run(
      `INSERT INTO sentence_submissions (client_id, session_id, student_id, word_id, submission_no, text, gate, counted, r_use, r_grammar, r_relevance, r_length, raw_total, final_marks, error_codes_json, evaluator, confidence, client_ts, server_ts)
       VALUES ('cid-1', ?, ?, ?, 1, 'Riya loves the zebra crossing quietly', 'ok', 1, 1, 1, 1, 1, 4, 4, '[]', 'rules', 0.9, '2026-11-16T10:00:00Z', '2026-11-16T10:00:00Z')`,
      [sid, a.students[0]!.id, word]);
    for (let i = 1; i <= 5; i++) await db.run("INSERT INTO feedback_responses (study_id, student_id, item_no, answer) VALUES (?, ?, ?, 'yes')", [id, a.students[0]!.id, i]);
    await db.run('INSERT INTO observation_records (study_id, student_id, week_no, accesses) VALUES (?, ?, 1, 1)', [id, a.students[0]!.id]);

    const names = [...NAMES_I, ...NAMES_C, 'zebra crossing'];
    for (const type of ['pack', 'scores', 'summary', 'participation', 'feedback', 'observations', 'authenticity']) {
      const r = await csv(t, id, type);
      expect(r.status, type).toBe(200);
      const text = r.body as string;
      for (const n of names) expect(text.includes(n), `${type} leaks ${n}`).toBe(false);
      expect(text.toLowerCase(), type).not.toMatch(/(^|[^a-z])roll(_?no|_?number)?([^a-z]|$)|first_?name/);
    }
    // student codes are the only identifier
    const scores = (await csv(t, id, 'scores')).body as string;
    expect(scores.split('\r\n')[1]).toMatch(/^S\d\d,intervention,/);
    expect(scores).toMatch(/\nC\d\d,comparison,/);
    void b;
  });

  it('sends a UTF-8 BOM CSV with the right filename and writes the audit entry', async () => {
    const { t, id } = await world();
    const r = await csv(t, id, 'scores');
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toBe(`attachment; filename="study-${id}-scores-2026-11-20.csv"`);
    const text = r.body as string;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.split('\r\n')).toHaveLength(15 + 2); // header + 15 analysable + trailing empty
    const row = text.split('\r\n').find((l) => l.startsWith('S01,'))!;
    expect(row).toMatch(/^S01,intervention,5,5,0,10,7,7,0,14,2,2,0,4,40,1$/);
    const log = await db.all("SELECT meta_json FROM audit_log WHERE action = 'study.export'");
    expect(log).toHaveLength(1);
    expect(JSON.parse(String(log[0]!.meta_json))).toMatchObject({ studyId: id, type: 'scores' });
  });

  it('the pack skips sections whose tables are empty and includes them once data exists', async () => {
    const { t, id, a } = await world(false);
    const before = (await csv(t, id, 'pack')).body as string;
    const sections = [...before.matchAll(SECTION_RE)].map((m) => m[1]);
    expect(sections).toEqual(expect.arrayContaining(['study', 'sample', 'summary_statistics', 'scores', 'participation_by_day', 'participation_by_student']));
    expect(sections).not.toContain('feedback_summary');
    expect(sections).not.toContain('observation_summary');
    expect(sections).not.toContain('authenticity_counts');
    expect(sections).not.toContain('comparison_group_welch');

    for (let i = 1; i <= 5; i++) await db.run("INSERT INTO feedback_responses (study_id, student_id, item_no, answer) VALUES (?, ?, ?, 'some')", [id, a.students[0]!.id, i]);
    await db.run('INSERT INTO observation_records (study_id, student_id, week_no, accesses, pos) VALUES (?, ?, 2, 1, 0)', [id, a.students[0]!.id]);
    const after = (await csv(t, id, 'pack')).body as string;
    const sections2 = [...after.matchAll(SECTION_RE)].map((m) => m[1]);
    expect(sections2).toEqual(expect.arrayContaining(['feedback_summary', 'observation_summary']));
  });

  it('rejects bad types and hides the study from other schools and anonymous callers', async () => {
    const { t, id } = await world(false);
    expect((await request(app).get(`/api/studies/${id}/export.csv?type=names`).set(auth(t))).status).toBe(400);
    expect((await request(app).get(`/api/studies/${id}/export.csv`).set(auth(t))).status).toBe(400);
    expect((await request(app).get(`/api/studies/${id}/results`)).status).toBe(401);
    const other = await registerTeacher(app, 'other@elsewhere.in', await makeSchool(app, 'Other'));
    expect((await request(app).get(`/api/studies/${id}/results`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(`/api/studies/${id}/export.csv?type=pack`).set(auth(other))).status).toBe(404);
    expect((await request(app).get('/api/studies/999999/results').set(auth(t))).status).toBe(404);
  });

  it('the school admin can read the same results', async () => {
    const { school, t, id } = await world(false);
    const adm = await request(app).get(`/api/studies/${id}/results`).set(auth(school.adminToken));
    expect(adm.status).toBe(200);
    expect(adm.body.counts.analysed).toBe(10);
    void t;
  });
});
