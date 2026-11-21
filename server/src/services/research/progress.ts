/**
 * F7 progress service: per-student whole-window counts and accuracy, and the day x student assignment grid.
 * Read-only; no tables of its own. Spec: docs/RESEARCH_FEATURES.md F7.
 */
import { addDays, isWeekend, studyDates, type IsoDate, type ProgressRes, type ProgressStudentRow } from '@shabd/core';
import type { Queryable } from '../../db/db.ts';
import { today } from '../../clock.ts';
import { notFound } from '../../http.ts';
import { getStudyForClass } from './study.ts';
import { loadHolidays } from './wordplan.ts';

const DEFAULT_WINDOW_DAYS = 28;
const SENTENCE_MAX = 40;
const WORDS_PER_DAY = 5;
const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export async function classProgress(db: Queryable, classId: number, fromQ?: string, toQ?: string): Promise<ProgressRes> {
  const cls = await db.get('SELECT id FROM classes WHERE id = ?', [classId]);
  if (!cls) throw notFound('Class not found');
  const study = await getStudyForClass(db, classId);

  let candidates: IsoDate[] = [];
  let defFrom: IsoDate;
  let defTo: IsoDate;
  if (study) {
    candidates = studyDates(study.startDate, await loadHolidays(db, study.studyId), study.schoolDays);
    defFrom = candidates[0] ?? study.startDate;
    defTo = candidates[candidates.length - 1] ?? study.startDate;
  } else {
    defTo = today();
    defFrom = addDays(defTo, -(DEFAULT_WINDOW_DAYS - 1));
  }
  const from = fromQ ?? defFrom;
  const to = toQ ?? defTo;
  let days: IsoDate[];
  if (study) {
    days = candidates.filter((d) => d >= from && d <= to);
  } else {
    days = [];
    for (let d = from, i = 0; d <= to && i < 400; d = addDays(d, 1), i++) if (!isWeekend(d)) days.push(d);
  }
  const daySet = new Set<string>(days);

  const students = await db.all<{ id: number; roll_no: number; first_name: string }>(
    'SELECT id, roll_no, first_name FROM students WHERE class_id = ? AND active = 1 ORDER BY roll_no',
    [classId],
  );
  const codes = new Map<number, string>();
  if (study) {
    for (const r of await db.all<{ student_id: number; study_code: string }>('SELECT student_id, study_code FROM study_participants WHERE study_id = ?', [study.studyId])) {
      codes.set(Number(r.student_id), r.study_code);
    }
  }

  const sess = (await db.all<{ id: number; student_id: number; date: string; completed_at: string | null }>(
    'SELECT id, student_id, date, completed_at FROM sessions WHERE class_id = ? AND date >= ? AND date <= ?',
    [classId, from, to],
  )).filter((s) => daySet.has(s.date));
  const sessionIds = new Set(sess.map((s) => Number(s.id)));

  const wordsBySession = new Map<number, number>(
    (await db.all<{ session_id: number; n: number }>(
      `SELECT ws.session_id, COUNT(*)::int AS n FROM word_scores ws JOIN sessions s ON s.id = ws.session_id
        WHERE s.class_id = ? AND s.date >= ? AND s.date <= ? GROUP BY ws.session_id`,
      [classId, from, to],
    )).map((r) => [Number(r.session_id), Number(r.n)]),
  );

  // First-try accuracy: attempt_no = 1 rows only, per stage.
  const firstTry = new Map<string, { ok: number; n: number }>();
  for (const r of await db.all<{ student_id: number; session_id: number; stage: string; is_correct: number }>(
    `SELECT a.student_id, a.session_id, a.stage, a.is_correct FROM word_attempts a JOIN sessions s ON s.id = a.session_id
      WHERE s.class_id = ? AND s.date >= ? AND s.date <= ? AND a.attempt_no = 1 AND a.stage IN ('meaning','pos')`,
    [classId, from, to],
  )) {
    if (!sessionIds.has(Number(r.session_id))) continue;
    const k = `${r.student_id}:${r.stage}`;
    const c = firstTry.get(k) ?? { ok: 0, n: 0 };
    c.n++;
    if (Number(r.is_correct) === 1) c.ok++;
    firstTry.set(k, c);
  }

  // Sentences: best counted raw_total per (session, word).
  const best = new Map<string, { student: number; raw: number }>();
  for (const r of await db.all<{ student_id: number; session_id: number; word_id: string; raw_total: number }>(
    `SELECT ss.student_id, ss.session_id, ss.word_id, ss.raw_total FROM sentence_submissions ss JOIN sessions s ON s.id = ss.session_id
      WHERE s.class_id = ? AND s.date >= ? AND s.date <= ? AND ss.counted = 1`,
    [classId, from, to],
  )) {
    if (!sessionIds.has(Number(r.session_id))) continue;
    const k = `${r.session_id}:${r.word_id}`;
    const cur = best.get(k);
    if (!cur || Number(r.raw_total) > cur.raw) best.set(k, { student: Number(r.student_id), raw: Number(r.raw_total) });
  }
  const sentence = new Map<number, { sum: number; n: number }>();
  for (const b of best.values()) {
    const c = sentence.get(b.student) ?? { sum: 0, n: 0 };
    c.sum += b.raw;
    c.n++;
    sentence.set(b.student, c);
  }

  const recall = new Map<number, { ok: number; n: number }>();
  for (const r of await db.all<{ student_id: number; date: string; is_correct: number }>(
    `SELECT r.student_id, r.date, r.is_correct FROM recall_attempts r JOIN students st ON st.id = r.student_id
      WHERE st.class_id = ? AND r.counted = 1 AND r.date >= ? AND r.date <= ?`,
    [classId, from, to],
  )) {
    if (!daySet.has(r.date)) continue;
    const c = recall.get(Number(r.student_id)) ?? { ok: 0, n: 0 };
    c.n++;
    if (Number(r.is_correct) === 1) c.ok++;
    recall.set(Number(r.student_id), c);
  }

  const rows: ProgressStudentRow[] = students.map((st) => {
    const sid = Number(st.id);
    const mine = sess.filter((s) => Number(s.student_id) === sid);
    const grid: Record<string, number | null> = Object.fromEntries(days.map((d) => [d, null]));
    let words = 0;
    for (const s of mine) {
      const n = wordsBySession.get(Number(s.id)) ?? 0;
      grid[s.date] = Math.min(WORDS_PER_DAY, n);
      words += n;
    }
    const m = firstTry.get(`${sid}:meaning`);
    const p = firstTry.get(`${sid}:pos`);
    const sn = sentence.get(sid);
    const rc = recall.get(sid);
    return {
      studentId: sid, rollNo: Number(st.roll_no), firstName: st.first_name, studyCode: codes.get(sid) ?? null,
      daysActive: mine.length,
      daysCompleted: mine.filter((s) => s.completed_at).length,
      wordsCompleted: words,
      meaningFirstTryPct: m ? pct(m.ok, m.n) : null,
      posFirstTryPct: p ? pct(p.ok, p.n) : null,
      sentenceAvgPct: sn ? pct(sn.sum, sn.n * SENTENCE_MAX) : null,
      recallPct: rc ? pct(rc.ok, rc.n) : null,
      lastActive: mine.reduce<string | null>((acc, s) => (acc === null || s.date > acc ? s.date : acc), null),
      grid,
    };
  });
  return { classId, from, to, inStudy: study !== null, days, wordsPerDay: WORDS_PER_DAY, students: rows };
}
