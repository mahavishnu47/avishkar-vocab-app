/**
 * F4 assessment service: forms, windows, attempts, auto-marking, results. Server-only: the forms (with answers)
 * are imported here and never reach the student bundle or any student payload.
 */
import { randomInt } from 'node:crypto';
import {
  ASSESSMENT_GRACE_SECONDS, ASSESSMENT_ITEM_MAX, ASSESSMENT_POS_OPTIONS, ASSESSMENT_SECTION_MAX, finalMarks, markSentenceItem,
} from '@shabd/core';
import type {
  AssessmentFormId, AssessmentKind, AssessmentMode, AssessmentResultRow, AssessmentScoreRow, AssessmentSection, AssessmentStatus,
  AssessmentWindowRes, AttemptStatus, PrintableForm, ResultStatus, ReviewItem, SavedAnswer, TestItem,
} from '@shabd/core';
import type { Queryable, Row } from '../../db/db.ts';
import formA from '../../research/assessment-forms/form-a.json' with { type: 'json' };
import formB from '../../research/assessment-forms/form-b.json' with { type: 'json' };

// ------------------------------------------------------------------ forms

interface FormA { id: string; wordId: string; word: string; pos: string; difficulty: number; correct: string; distractors: string[] }
interface FormB { id: string; wordId: string; word: string; difficulty: number; sentence: string; target: string; answer: string }
interface FormC { id: string; wordId: string; word: string; pos: string; difficulty: number; meaning: string; exampleSentence: string; contextWords: string[]; forms?: string[] }
export interface Form { formId: AssessmentFormId; formVersion: number; sectionA: FormA[]; sectionB: FormB[]; sectionC: FormC[] }

const FORMS: Record<AssessmentFormId, Form> = { A: formA as Form, B: formB as Form };
export const getForm = (id: AssessmentFormId): Form => FORMS[id];
export const allForms = (): Form[] => [FORMS.A, FORMS.B];

type FormItem = { section: AssessmentSection; id: string };
function formItems(f: Form): FormItem[] {
  return [
    ...f.sectionA.map((i) => ({ section: 'A' as const, id: i.id })),
    ...f.sectionB.map((i) => ({ section: 'B' as const, id: i.id })),
    ...f.sectionC.map((i) => ({ section: 'C' as const, id: i.id })),
  ];
}
export function findItem(f: Form, itemId: string): { section: 'A'; item: FormA } | { section: 'B'; item: FormB } | { section: 'C'; item: FormC } | null {
  const a = f.sectionA.find((i) => i.id === itemId); if (a) return { section: 'A', item: a };
  const b = f.sectionB.find((i) => i.id === itemId); if (b) return { section: 'B', item: b };
  const c = f.sectionC.find((i) => i.id === itemId); if (c) return { section: 'C', item: c };
  return null;
}

// ------------------------------------------------------------------ seeded shuffle

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const r = [...arr];
  const rnd = mulberry32(seed);
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/** Items in the order this student sees them (sections stay A, B, C; items and options are shuffled by the seed). No answers. */
export function itemsForStudent(f: Form, seed: number): TestItem[] {
  const a: TestItem[] = seededShuffle(f.sectionA, seed ^ 0xa1).map((i) => ({
    id: i.id, section: 'A' as const, word: i.word, options: seededShuffle([i.correct, ...i.distractors], seed ^ hash(i.id)),
  }));
  const b: TestItem[] = seededShuffle(f.sectionB, seed ^ 0xb2).map((i) => ({
    id: i.id, section: 'B' as const, sentence: i.sentence, target: i.target, options: seededShuffle(ASSESSMENT_POS_OPTIONS, seed ^ hash(i.id)),
  }));
  const c: TestItem[] = seededShuffle(f.sectionC, seed ^ 0xc3).map((i) => ({ id: i.id, section: 'C' as const, word: i.word }));
  return [...a, ...b, ...c];
}

export function printableForm(f: Form): PrintableForm {
  return {
    formId: f.formId,
    formVersion: f.formVersion,
    sectionA: f.sectionA.map((i, n) => {
      const options = [...i.distractors]; options.splice(n % 4, 0, i.correct);
      return { id: i.id, word: i.word, options, answer: i.correct };
    }),
    sectionB: f.sectionB.map((i) => ({ id: i.id, sentence: i.sentence, target: i.target, options: [...ASSESSMENT_POS_OPTIONS], answer: i.answer })),
    sectionC: f.sectionC.map((i) => ({ id: i.id, word: i.word, example: i.exampleSentence })),
    scheme: [
      'Section A (10 marks): 1 mark for each correct meaning.',
      'Section B (10 marks): 1 mark for each correct part of speech.',
      'Section C (10 marks, 2 per sentence): 1 mark if the word is used correctly in the sentence; 1 mark if the sentence is meaningful (a capital letter, a full stop, a verb, and it makes sense with the word).',
      'Section C: do not give marks for a sentence copied from the word card or lesson. Total: 30 marks.',
    ],
  };
}

// ------------------------------------------------------------------ time

export const nowIso = (): string => new Date().toISOString();
const graceMs = ASSESSMENT_GRACE_SECONDS * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateAccessCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

// ------------------------------------------------------------------ windows

export interface WindowRow {
  id: number; class_id: number; kind: AssessmentKind; form_id: AssessmentFormId; form_version: number; mode: AssessmentMode;
  duration_min: number; access_code: string; opened_at: string | null; closed_at: string | null; created_by: number | null;
}
export interface AttemptRow {
  id: number; window_id: number; student_id: number; started_at: string; deadline_at: string; submitted_at: string | null; order_seed: number;
}

export function statusOf(w: Pick<WindowRow, 'opened_at' | 'closed_at'>): AssessmentStatus {
  return w.closed_at ? 'closed' : w.opened_at ? 'open' : 'draft';
}
export const attemptStatus = (a: AttemptRow | undefined): AttemptStatus => (!a ? 'not_started' : a.submitted_at ? 'submitted' : 'in_progress');

export async function getWindow(q: Queryable, windowId: number): Promise<WindowRow | undefined> {
  return q.get<WindowRow>('SELECT * FROM assessment_windows WHERE id = ?', [windowId]);
}

export async function windowRes(q: Queryable, w: WindowRow): Promise<AssessmentWindowRes> {
  const counts = await q.get<{ students: number; started: number; submitted: number }>(
    `SELECT (SELECT COUNT(*) FROM students WHERE class_id = ? AND active = 1) AS students,
            (SELECT COUNT(*) FROM assessment_attempts WHERE window_id = ?) AS started,
            (SELECT COUNT(*) FROM assessment_attempts WHERE window_id = ? AND submitted_at IS NOT NULL) AS submitted`,
    [w.class_id, w.id, w.id],
  );
  return {
    id: w.id, classId: w.class_id, kind: w.kind, formId: w.form_id, formVersion: w.form_version, mode: w.mode, durationMin: w.duration_min,
    accessCode: w.access_code, status: statusOf(w), openedAt: w.opened_at, closedAt: w.closed_at,
    studentCount: counts?.students ?? 0, started: counts?.started ?? 0, submitted: counts?.submitted ?? 0,
  };
}

// ------------------------------------------------------------------ marking

interface ResponseRow {
  attempt_id: number; item_id: string; section: AssessmentSection; answer: string; auto_marks: number | null; auto_detail_json: string | null;
  override_marks: number | null; needs_review: number;
}

/** Mark every item of the form for an attempt (blank items get a row with 0). Idempotent. */
export async function markAttempt(q: Queryable, attemptId: number, form: Form): Promise<void> {
  const rows = await q.all<ResponseRow>('SELECT * FROM assessment_responses WHERE attempt_id = ?', [attemptId]);
  const have = new Map(rows.map((r) => [r.item_id, r]));
  for (const it of formItems(form)) {
    const ans = (have.get(it.id)?.answer ?? '').trim();
    const found = findItem(form, it.id)!;
    let marks = 0;
    let needs = 0;
    let detail: Record<string, unknown> = {};
    if (found.section === 'A') {
      marks = ans !== '' && ans === found.item.correct ? 1 : 0;
      detail = { blank: ans === '' };
    } else if (found.section === 'B') {
      marks = ans.toLowerCase() === found.item.answer ? 1 : 0;
      detail = { blank: ans === '' };
    } else {
      const m = markSentenceItem(ans, { word: found.item.word, partOfSpeech: found.item.pos as never, exampleSentence: found.item.exampleSentence, contextWords: found.item.contextWords, forms: found.item.forms });
      marks = m.marks;
      needs = m.needsReview ? 1 : 0;
      detail = { useMark: m.useMark, meaningMark: m.meaningMark, ...m.detail };
    }
    await q.run(
      `INSERT INTO assessment_responses (attempt_id, item_id, section, answer, auto_marks, auto_detail_json, needs_review)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (attempt_id, item_id) DO UPDATE SET auto_marks = EXCLUDED.auto_marks, auto_detail_json = EXCLUDED.auto_detail_json, needs_review = EXCLUDED.needs_review`,
      [attemptId, it.id, it.section, ans, marks, JSON.stringify(detail), needs],
    );
  }
}

/** Submit an attempt (idempotent) and mark it. `at` is the submission time (the deadline for auto-submits). */
export async function submitAttempt(q: Queryable, attempt: AttemptRow, at: string): Promise<void> {
  const w = (await getWindow(q, attempt.window_id))!;
  await q.tx(async (t) => {
    await markAttempt(t, attempt.id, getForm(w.form_id));
    await t.run('UPDATE assessment_attempts SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL', [at, attempt.id]);
  });
}

/** Auto-submit attempts that ran past deadline + grace, or whose window was closed. */
export async function finalizeExpired(q: Queryable, windowId: number): Promise<void> {
  const w = await getWindow(q, windowId);
  if (!w) return;
  const open = await q.all<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ? AND submitted_at IS NULL', [windowId]);
  const now = Date.now();
  for (const a of open) {
    const pastGrace = now > Date.parse(a.deadline_at) + graceMs;
    if (w.closed_at) await submitAttempt(q, a, Date.parse(w.closed_at) < Date.parse(a.deadline_at) ? w.closed_at : a.deadline_at);
    else if (pastGrace) await submitAttempt(q, a, a.deadline_at);
  }
}

// ------------------------------------------------------------------ scores

interface SectionSums { a: number; b: number; c: number }
const sectionKey = (s: string): 'a' | 'b' | 'c' => s.toLowerCase() as 'a' | 'b' | 'c';

/** Sum final marks (override ?? auto) per section, capped at 10. */
async function attemptSums(q: Queryable, attemptIds: number[]): Promise<Map<number, SectionSums & { review: number }>> {
  const out = new Map<number, SectionSums & { review: number }>();
  if (attemptIds.length === 0) return out;
  const rows = await q.all<ResponseRow>('SELECT * FROM assessment_responses WHERE attempt_id = ANY(?::int[])', [attemptIds]);
  for (const r of rows) {
    const cur = out.get(r.attempt_id) ?? { a: 0, b: 0, c: 0, review: 0 };
    cur[sectionKey(r.section)] += finalMarks(r.auto_marks, r.override_marks);
    if (r.needs_review === 1 && r.override_marks === null) cur.review++;
    out.set(r.attempt_id, cur);
  }
  for (const v of out.values()) { v.a = Math.min(v.a, ASSESSMENT_SECTION_MAX); v.b = Math.min(v.b, ASSESSMENT_SECTION_MAX); v.c = Math.min(v.c, ASSESSMENT_SECTION_MAX); }
  return out;
}

/** Per-student results for one window (roster students only). Manual paper totals take precedence over auto marks. */
export async function windowResults(q: Queryable, w: WindowRow): Promise<AssessmentResultRow[]> {
  await finalizeExpired(q, w.id);
  const students = await q.all<{ id: number; roll_no: number; first_name: string }>(
    'SELECT id, roll_no, first_name FROM students WHERE class_id = ? AND active = 1 ORDER BY roll_no', [w.class_id]);
  const attempts = await q.all<AttemptRow>('SELECT * FROM assessment_attempts WHERE window_id = ?', [w.id]);
  const manual = await q.all<{ student_id: number; section_a: number; section_b: number; section_c: number }>(
    'SELECT * FROM assessment_manual_scores WHERE window_id = ?', [w.id]);
  const sums = await attemptSums(q, attempts.filter((a) => a.submitted_at).map((a) => a.id));
  return students.map((s): AssessmentResultRow => {
    const at = attempts.find((a) => a.student_id === s.id);
    const man = manual.find((m) => m.student_id === s.id);
    const sm = at ? sums.get(at.id) : undefined;
    const base = { studentId: s.id, rollNo: s.roll_no, firstName: s.first_name, needsReview: sm?.review ?? 0 };
    if (man) return { ...base, status: at ? attemptStatus(at) : 'manual', a: man.section_a, b: man.section_b, c: man.section_c, total: man.section_a + man.section_b + man.section_c, source: 'manual' };
    if (at?.submitted_at) { const x = sm ?? { a: 0, b: 0, c: 0 }; return { ...base, status: 'submitted', a: x.a, b: x.b, c: x.c, total: x.a + x.b + x.c, source: 'auto' }; }
    return { ...base, status: at ? 'in_progress' : 'not_started', a: null, b: null, c: null, total: null, source: null };
  });
}

/** For F8: A/B/C/total per student and window kind of a class. Only students with submitted or paper marks appear. */
export async function assessmentScores(q: Queryable, classId: number): Promise<AssessmentScoreRow[]> {
  const windows = await q.all<WindowRow>('SELECT * FROM assessment_windows WHERE class_id = ? ORDER BY id', [classId]);
  const out: AssessmentScoreRow[] = [];
  for (const w of windows) {
    for (const r of await windowResults(q, w)) {
      if (r.a === null || r.b === null || r.c === null || r.total === null) continue;
      out.push({ studentId: r.studentId, kind: w.kind, a: r.a, b: r.b, c: r.c, total: r.total, complete: true });
    }
  }
  return out;
}

export function promptFor(f: Form, itemId: string): { section: AssessmentSection; prompt: string; key: string; max: number } {
  const found = findItem(f, itemId)!;
  if (found.section === 'A') return { section: 'A', prompt: `What does "${found.item.word}" mean?`, key: found.item.correct, max: ASSESSMENT_ITEM_MAX.A };
  if (found.section === 'B') return { section: 'B', prompt: `${found.item.sentence}  (What part of speech is "${found.item.target}"?)`, key: found.item.answer, max: ASSESSMENT_ITEM_MAX.B };
  return { section: 'C', prompt: `Write your own sentence using "${found.item.word}".`, key: found.item.exampleSentence, max: ASSESSMENT_ITEM_MAX.C };
}

export async function reviewItems(q: Queryable, w: WindowRow, attemptId: number): Promise<ReviewItem[]> {
  const f = getForm(w.form_id);
  const rows = await q.all<ResponseRow>('SELECT * FROM assessment_responses WHERE attempt_id = ?', [attemptId]);
  return formItems(f).map((it) => {
    const r = rows.find((x) => x.item_id === it.id);
    const p = promptFor(f, it.id);
    return {
      itemId: it.id, section: it.section, prompt: p.prompt, answer: r?.answer ?? '', key: p.key, maxMarks: p.max,
      autoMarks: r?.auto_marks ?? null, overrideMarks: r?.override_marks ?? null, finalMarks: finalMarks(r?.auto_marks, r?.override_marks),
      needsReview: r?.needs_review === 1, detail: r?.auto_detail_json ? (JSON.parse(r.auto_detail_json) as Record<string, unknown>) : null,
    };
  });
}

export function savedAnswers(rows: Row[]): SavedAnswer[] {
  return (rows as unknown as ResponseRow[]).filter((r) => r.answer !== '').map((r) => ({ itemId: r.item_id, answer: r.answer }));
}

export type { ResultStatus };
