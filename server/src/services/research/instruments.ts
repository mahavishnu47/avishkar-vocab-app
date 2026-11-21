/**
 * F9 service: weekly observation records, feedback questionnaire, and the summary used by F8.
 * Indicator columns hold 1 (yes), 0 (no) or NULL (not observed). No free text is stored.
 */
import type {
  FeedbackAnswer, FeedbackAnswerWrite, FeedbackItemSummary, FeedbackRow, FeedbackSource, FeedbackWindow, InstrumentSummary,
  ObservationKey, ObservationRow, ObservationValues, ObservationWeekSummary, StudyParticipant,
} from '@shabd/core';
import { FEEDBACK_ITEMS, FEEDBACK_ITEM_COUNT, OBSERVATION_INDICATORS, OBSERVATION_KEYS } from '@shabd/core';
import type { Queryable } from '../../db/db.ts';
import { registerResearchTable } from './study.ts';

registerResearchTable('observation_records');
registerResearchTable('feedback_responses');

const nowIso = (): string => new Date().toISOString();
const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

// ---------- observations ----------

export async function getObservations(db: Queryable, studyId: number, week: number, people: StudyParticipant[]): Promise<ObservationRow[]> {
  const recs = await db.all<Record<string, unknown>>('SELECT * FROM observation_records WHERE study_id = ? AND week_no = ?', [studyId, week]);
  const byStudent = new Map(recs.map((r) => [r.student_id as number, r]));
  return people.map((p) => {
    const r = byStudent.get(p.studentId);
    const values = {} as ObservationValues;
    for (const k of OBSERVATION_KEYS) {
      const v = r ? (r[k] as number | null) : null;
      values[k] = v === null || v === undefined ? null : Number(v) === 1;
    }
    return {
      studentId: p.studentId, studyCode: p.studyCode, classId: p.classId, className: p.className, rollNo: p.rollNo, firstName: p.firstName,
      values, observedOn: r ? ((r.observed_on as string | null) ?? null) : null,
    };
  });
}

/** Upsert: only the keys present in `values` change (null clears). Column names come from the fixed key list. */
export async function putObservation(
  db: Queryable, studyId: number, studentId: number, week: number, values: Partial<Record<ObservationKey, boolean | null>>,
  observedOn: string, observerId: number,
): Promise<void> {
  const keys = OBSERVATION_KEYS.filter((k) => values[k] !== undefined);
  const cols = keys.join(', ');
  const vals = keys.map((k) => (values[k] === null ? null : values[k] ? 1 : 0));
  const sets = keys.map((k) => `${k} = EXCLUDED.${k}`).join(', ');
  await db.run(
    `INSERT INTO observation_records (study_id, student_id, week_no${keys.length ? ', ' + cols : ''}, observed_on, observer_id, updated_at)
     VALUES (?, ?, ?${keys.map(() => ', ?').join('')}, ?, ?, ?)
     ON CONFLICT (study_id, student_id, week_no) DO UPDATE SET ${sets ? sets + ', ' : ''}observed_on = EXCLUDED.observed_on, observer_id = EXCLUDED.observer_id, updated_at = EXCLUDED.updated_at`,
    [studyId, studentId, week, ...vals, observedOn, observerId, nowIso()],
  );
}

// ---------- feedback ----------

export async function feedbackWindow(db: Queryable, studyId: number): Promise<FeedbackWindow> {
  const s = await db.get<{ feedback_open_at: string | null; feedback_closed_at: string | null }>('SELECT feedback_open_at, feedback_closed_at FROM studies WHERE id = ?', [studyId]);
  const openedAt = s?.feedback_open_at ?? null;
  const closedAt = s?.feedback_closed_at ?? null;
  return { open: openedAt !== null && closedAt === null, openedAt, closedAt };
}

export async function setFeedbackWindow(db: Queryable, studyId: number, open: boolean): Promise<FeedbackWindow> {
  if (open) await db.run('UPDATE studies SET feedback_open_at = COALESCE(feedback_open_at, ?), feedback_closed_at = NULL WHERE id = ?', [nowIso(), studyId]);
  else await db.run('UPDATE studies SET feedback_closed_at = ? WHERE id = ? AND feedback_open_at IS NOT NULL AND feedback_closed_at IS NULL', [nowIso(), studyId]);
  return feedbackWindow(db, studyId);
}

export async function studentAnswers(db: Queryable, studyId: number, studentId: number): Promise<(FeedbackAnswer | null)[]> {
  const rows = await db.all<{ item_no: number; answer: FeedbackAnswer }>('SELECT item_no, answer FROM feedback_responses WHERE study_id = ? AND student_id = ?', [studyId, studentId]);
  const out: (FeedbackAnswer | null)[] = Array.from({ length: FEEDBACK_ITEM_COUNT }, () => null);
  for (const r of rows) out[r.item_no - 1] = r.answer;
  return out;
}

export async function putFeedback(db: Queryable, studyId: number, studentId: number, answers: FeedbackAnswerWrite[], source: FeedbackSource): Promise<void> {
  await db.tx(async (q) => {
    for (const a of answers) {
      await q.run(
        `INSERT INTO feedback_responses (study_id, student_id, item_no, answer, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (study_id, student_id, item_no) DO UPDATE SET answer = EXCLUDED.answer, source = EXCLUDED.source, updated_at = EXCLUDED.updated_at`,
        [studyId, studentId, a.itemNo, a.answer, source, nowIso()],
      );
    }
  });
}

export async function feedbackRows(db: Queryable, studyId: number, people: StudyParticipant[]): Promise<FeedbackRow[]> {
  const recs = await db.all<{ student_id: number; item_no: number; answer: FeedbackAnswer; source: FeedbackSource }>(
    'SELECT student_id, item_no, answer, source FROM feedback_responses WHERE study_id = ?', [studyId]);
  return people.map((p) => {
    const answers: (FeedbackAnswer | null)[] = Array.from({ length: FEEDBACK_ITEM_COUNT }, () => null);
    let source: FeedbackSource | null = null;
    for (const r of recs) if (r.student_id === p.studentId) { answers[r.item_no - 1] = r.answer; source = r.source; }
    return { studentId: p.studentId, studyCode: p.studyCode, classId: p.classId, className: p.className, rollNo: p.rollNo, firstName: p.firstName, answers, source };
  });
}

// ---------- summary ----------

/** Counts over analysable participants (consent given, not excluded) of the whole study. Anonymous: no ids in the output. */
export async function instrumentSummary(db: Queryable, studyId: number): Promise<InstrumentSummary> {
  const ids = (await db.all<{ student_id: number }>(
    "SELECT student_id FROM study_participants WHERE study_id = ? AND consent = 'given' AND excluded = 0", [studyId])).map((r) => r.student_id);
  const set = new Set(ids);
  const obs = (await db.all<Record<string, unknown>>('SELECT * FROM observation_records WHERE study_id = ?', [studyId])).filter((r) => set.has(r.student_id as number));
  const weekNos = [...new Set(obs.map((r) => r.week_no as number))].sort((a, b) => a - b);
  const weeks: ObservationWeekSummary[] = weekNos.map((week) => {
    const rows = obs.filter((r) => r.week_no === week);
    return {
      week,
      indicators: OBSERVATION_INDICATORS.map((ind) => {
        const yes = rows.filter((r) => Number(r[ind.key]) === 1 && r[ind.key] !== null).length;
        const no = rows.filter((r) => r[ind.key] !== null && Number(r[ind.key]) === 0).length;
        return { key: ind.key, label: ind.label, yes, no, notObserved: ids.length - yes - no };
      }),
    };
  });
  const fb = (await db.all<{ student_id: number; item_no: number; answer: FeedbackAnswer }>(
    'SELECT student_id, item_no, answer FROM feedback_responses WHERE study_id = ?', [studyId])).filter((r) => set.has(r.student_id));
  const items: FeedbackItemSummary[] = FEEDBACK_ITEMS.map((it) => {
    const rows = fb.filter((r) => r.item_no === it.itemNo);
    const c = (a: FeedbackAnswer) => rows.filter((r) => r.answer === a).length;
    const n = rows.length;
    return { itemNo: it.itemNo, text: it.text, yes: c('yes'), some: c('some'), no: c('no'), n, pctYes: pct(c('yes'), n), pctSome: pct(c('some'), n), pctNo: pct(c('no'), n) };
  });
  return { studyId, participants: ids.length, observation: { weeks }, feedback: { respondents: new Set(fb.map((r) => r.student_id)).size, items } };
}
