/**
 * F2 service: the 20-day word plan (seeded from content/study/word-a-day-100.json), holidays, and the study-day
 * lookup used by the daily set and the student gate. Spec: docs/RESEARCH_FEATURES.md F2.
 */
import {
  STUDY_PLAN_WORDS_PER_DAY, planWarnings, studyDateFor, studyDayFor,
  type IsoDate, type PlanDay, type StudyDayRes, type StudyGroup, type StudyPlanRes,
} from '@shabd/core';
import type { TeacherAuth } from '../../auth.ts';
import type { Queryable } from '../../db/db.ts';
import { HttpError, badRequest } from '../../http.ts';
import planJson from '../../../../content/study/word-a-day-100.json' with { type: 'json' };
import { assertStudyVisible } from './study.ts';

export interface PlanFile { version: number; days: { day: number; wordIds: string[] }[] }
export const PLAN_FILE = planJson as PlanFile;

export async function loadHolidays(q: Queryable, studyId: number): Promise<IsoDate[]> {
  return (await q.all<{ date: string }>('SELECT date FROM study_holidays WHERE study_id = ? ORDER BY date', [studyId])).map((r) => r.date);
}

/** Fills study_plan from the JSON when the study has no plan rows yet. Words missing from the bank are skipped. */
export async function ensurePlan(q: Queryable, studyId: number): Promise<void> {
  const have = await q.get<{ n: number }>('SELECT count(*)::int AS n FROM study_plan WHERE study_id = ?', [studyId]);
  if (have && Number(have.n) > 0) return;
  for (const d of PLAN_FILE.days) {
    for (let i = 0; i < d.wordIds.length; i++) {
      await q.run(
        'INSERT INTO study_plan (study_id, day_no, position, word_id) SELECT ?, ?, ?, id FROM words WHERE id = ? ON CONFLICT DO NOTHING',
        [studyId, d.day, i + 1, d.wordIds[i]],
      );
    }
  }
}

/** The plan's word ids for a study day, or null when that day is not fully planned. */
export async function planWordIds(q: Queryable, studyId: number, dayNo: number): Promise<string[] | null> {
  await ensurePlan(q, studyId);
  const rows = await q.all<{ word_id: string }>('SELECT word_id FROM study_plan WHERE study_id = ? AND day_no = ? ORDER BY position', [studyId, dayNo]);
  return rows.length === STUDY_PLAN_WORDS_PER_DAY ? rows.map((r) => r.word_id) : null;
}

export interface ClassStudyDay { studyId: number; group: StudyGroup; dayNo: number | null; reason: StudyDayRes['reason']; schoolDays: number }

/** Study-day state for a class on a date. null when the class is not in a running study (normal behaviour applies). */
export async function classStudyDay(q: Queryable, classId: number, date: IsoDate): Promise<ClassStudyDay | null> {
  const s = await q.get<{ id: number; grp: StudyGroup; start_date: string; school_days: number }>(
    `SELECT s.id, sc.grp, s.start_date, s.school_days FROM study_classes sc JOIN studies s ON s.id = sc.study_id
      WHERE sc.class_id = ? AND s.status = 'running' ORDER BY s.id DESC LIMIT 1`,
    [classId],
  );
  if (!s) return null;
  if (s.grp === 'comparison') return { studyId: s.id, group: s.grp, dayNo: null, reason: 'comparison', schoolDays: s.school_days };
  const r = studyDayFor(s.start_date, date, await loadHolidays(q, s.id), s.school_days);
  return { studyId: s.id, group: s.grp, dayNo: r.dayNo, reason: r.reason, schoolDays: s.school_days };
}

// ---------- teacher plan view ----------

export async function buildPlan(a: TeacherAuth, q: Queryable, studyId: number): Promise<StudyPlanRes> {
  const study = await assertStudyVisible(q, a, studyId);
  await ensurePlan(q, studyId);
  const holidays = await loadHolidays(q, studyId);
  const schoolDays = study.school_days as number;
  const startDate = study.start_date as string;
  const rows = await q.all<{ day_no: number; position: number; word_id: string; word: string; part_of_speech: string; difficulty: number }>(
    `SELECT p.day_no, p.position, p.word_id, w.word, w.part_of_speech, w.difficulty
       FROM study_plan p JOIN words w ON w.id = p.word_id WHERE p.study_id = ? AND p.day_no <= ? ORDER BY p.day_no, p.position`,
    [studyId, schoolDays],
  );
  const days: PlanDay[] = [];
  const posCounts: Record<string, number> = { noun: 0, verb: 0, adjective: 0, adverb: 0 };
  for (let n = 1; n <= schoolDays; n++) {
    const words = rows.filter((r) => r.day_no === n).map((r) => ({
      position: r.position, wordId: r.word_id, word: r.word, partOfSpeech: r.part_of_speech, difficulty: r.difficulty,
    }));
    for (const w of words) posCounts[w.partOfSpeech] = (posCounts[w.partOfSpeech] ?? 0) + 1;
    days.push({ dayNo: n, date: studyDateFor(startDate, holidays, n), words });
  }
  return { studyId, startDate, schoolDays, holidays, days, posCounts, warnings: planWarnings(posCounts) };
}

export async function setPlanDay(a: TeacherAuth, q: Queryable, studyId: number, dayNo: number, wordIds: string[]): Promise<void> {
  const study = await assertStudyVisible(q, a, studyId);
  if (study.status === 'closed') throw new HttpError(409, 'conflict', 'This study is closed');
  if (dayNo < 1 || dayNo > (study.school_days as number)) throw badRequest('dayNo is outside the study');
  if (wordIds.length !== STUDY_PLAN_WORDS_PER_DAY || new Set(wordIds).size !== wordIds.length) throw badRequest('Pick 5 different words');
  const found = await q.all<{ id: string }>('SELECT id FROM words WHERE id = ANY(?::text[])', [wordIds]);
  if (found.length !== wordIds.length) throw badRequest('One of the words does not exist');
  await q.tx(async (t) => {
    await ensurePlan(t, studyId);
    await t.run('DELETE FROM study_plan WHERE study_id = ? AND day_no = ?', [studyId, dayNo]);
    for (let i = 0; i < wordIds.length; i++) {
      await t.run('INSERT INTO study_plan (study_id, day_no, position, word_id) VALUES (?, ?, ?, ?)', [studyId, dayNo, i + 1, wordIds[i]]);
    }
  });
}

export async function setHolidays(a: TeacherAuth, q: Queryable, studyId: number, dates: IsoDate[]): Promise<void> {
  const study = await assertStudyVisible(q, a, studyId);
  if (study.status === 'closed') throw new HttpError(409, 'conflict', 'This study is closed');
  await q.tx(async (t) => {
    await t.run('DELETE FROM study_holidays WHERE study_id = ?', [studyId]);
    for (const d of new Set(dates)) await t.run('INSERT INTO study_holidays (study_id, date) VALUES (?, ?)', [studyId, d]);
  });
}
