/**
 * F4 assessment: public (answer-free) types shared by server and web, plus the pure rule-based marking of
 * Section C sentences. Never uses Claude, so marks are reproducible (docs/RESEARCH_FEATURES.md F4).
 */
import { evaluateSentenceRules } from '../sentence.ts';
import type { SentenceErrorCode, SentenceGate, SentenceWordContext } from '../types.ts';

export type AssessmentKind = 'pre' | 'post';
export type AssessmentFormId = 'A' | 'B';
export type AssessmentMode = 'app' | 'paper';
export type AssessmentSection = 'A' | 'B' | 'C';
export type AssessmentStatus = 'draft' | 'open' | 'closed';
export type AttemptStatus = 'not_started' | 'in_progress' | 'submitted';

export const ASSESSMENT_SECTIONS: readonly AssessmentSection[] = ['A', 'B', 'C'];
/** Marks available per item in each section (A and B: 1 each, C: 2 each) and per section (10 each, 30 total). */
export const ASSESSMENT_ITEM_MAX: Record<AssessmentSection, number> = { A: 1, B: 1, C: 2 };
export const ASSESSMENT_SECTION_MAX = 10;
export const ASSESSMENT_TOTAL_MAX = 30;
/** Seconds after the deadline during which a late autosave or submit is still accepted. */
export const ASSESSMENT_GRACE_SECONDS = 60;
export const ASSESSMENT_POS_OPTIONS = ['noun', 'verb', 'adjective', 'adverb'] as const;
export const ASSESSMENT_MARKER_VERSION = 'rules-1';

// ------------------------------------------------------------------ items as the student sees them (no answers)

export interface TestItemA { id: string; section: 'A'; word: string; options: string[] }
export interface TestItemB { id: string; section: 'B'; sentence: string; target: string; options: string[] }
export interface TestItemC { id: string; section: 'C'; word: string }
export type TestItem = TestItemA | TestItemB | TestItemC;

export interface SavedAnswer { itemId: string; answer: string }

/** What the student app gets from GET /student/assessments/current. */
export interface StudentAssessmentCurrentRes {
  assessment: null | {
    windowId: number;
    kind: AssessmentKind;
    durationMin: number;
    attempt: AttemptStatus;
    deadlineAt: string | null;
  };
  serverNow: string;
}

export interface StartAssessmentReq { accessCode: string }
export interface StartAssessmentRes {
  windowId: number;
  kind: AssessmentKind;
  attempt: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
  /** empty once submitted */
  items: TestItem[];
  saved: SavedAnswer[];
}

export interface ResponseWrite {
  itemId: string;
  answer: string;
  msElapsed?: number;
  keystrokes?: number;
  deletions?: number;
}
export interface SaveResponsesReq { items: ResponseWrite[] }
export interface SaveResponsesRes { saved: number; deadlineAt: string; serverNow: string }
export interface SubmitAssessmentRes { submitted: true }

// ------------------------------------------------------------------ teacher side

export interface AssessmentWindowRes {
  id: number;
  classId: number;
  kind: AssessmentKind;
  formId: AssessmentFormId;
  formVersion: number;
  mode: AssessmentMode;
  durationMin: number;
  accessCode: string;
  status: AssessmentStatus;
  openedAt: string | null;
  closedAt: string | null;
  studentCount: number;
  started: number;
  submitted: number;
}

export interface CreateAssessmentReq { kind: AssessmentKind; formId?: AssessmentFormId; mode?: AssessmentMode; durationMin?: number }
export type PatchAssessmentReq =
  | { action: 'open' | 'close' }
  | { action: 'reset_attempt'; studentId: number }
  | { action: 'update'; formId?: AssessmentFormId; mode?: AssessmentMode; durationMin?: number };

export type ResultStatus = 'not_started' | 'in_progress' | 'submitted' | 'manual';
export interface AssessmentResultRow {
  studentId: number;
  rollNo: number;
  firstName: string;
  status: ResultStatus;
  a: number | null;
  b: number | null;
  c: number | null;
  total: number | null;
  needsReview: number;
  source: 'auto' | 'manual' | null;
}
export interface AssessmentResultsRes { window: AssessmentWindowRes; rows: AssessmentResultRow[] }

export interface ReviewItem {
  itemId: string;
  section: AssessmentSection;
  prompt: string;
  /** what the child answered ('' when blank) */
  answer: string;
  /** model answer (A: the meaning, B: the part of speech, C: the example sentence) */
  key: string;
  maxMarks: number;
  autoMarks: number | null;
  overrideMarks: number | null;
  finalMarks: number;
  needsReview: boolean;
  detail: Record<string, unknown> | null;
}
export interface StudentAssessmentRes {
  windowId: number;
  studentId: number;
  rollNo: number;
  firstName: string;
  status: ResultStatus;
  items: ReviewItem[];
  manual: { a: number; b: number; c: number } | null;
  a: number | null;
  b: number | null;
  c: number | null;
  total: number | null;
}
export interface OverrideItemReq { overrideMarks: number | null }
export interface ManualScoresReq { a: number; b: number; c: number }

export interface AssessmentScoreRow { studentId: number; kind: AssessmentKind; a: number; b: number; c: number; total: number; complete: boolean }

/** Printable form for the teacher (key and marking scheme included). */
export interface PrintableForm {
  formId: AssessmentFormId;
  formVersion: number;
  sectionA: { id: string; word: string; options: string[]; answer: string }[];
  sectionB: { id: string; sentence: string; target: string; options: string[]; answer: string }[];
  sectionC: { id: string; word: string; example: string }[];
  scheme: string[];
}

// ------------------------------------------------------------------ marking Section C

export interface SentenceMarkDetail {
  gate: SentenceGate;
  errorCodes: SentenceErrorCode[];
  confidence: number;
  rubric: { use: number; grammar: number; relevance: number; length: number };
  evaluator: string;
}
export interface SentenceItemMark {
  /** 0..2 */
  marks: 0 | 1 | 2;
  /** "word used correctly" */
  useMark: 0 | 1;
  /** "meaningful sentence" */
  meaningMark: 0 | 1;
  needsReview: boolean;
  detail: SentenceMarkDetail;
}

/**
 * Section C marking (rules only): 1 mark for using the word correctly, 1 mark for a meaningful sentence.
 * needsReview when the evaluator is unsure (confidence < 0.6), exactly 1 mark was given, or a non-empty answer was gated.
 */
export function markSentenceItem(text: string, word: SentenceWordContext): SentenceItemMark {
  const ev = evaluateSentenceRules(text, word);
  const ok = ev.gate === 'ok';
  const codes = ev.errorCodes;
  const useMark: 0 | 1 = ok && ev.rubric.use === 10 && !codes.includes('SN_WRONG_FORM') ? 1 : 0;
  const meaningMark: 0 | 1 = ok && ev.rubric.grammar >= 6 && ev.rubric.relevance >= 8 && ev.rubric.length > 0 && !codes.includes('SN_NO_VERB') ? 1 : 0;
  const marks = (useMark + meaningMark) as 0 | 1 | 2;
  const nonEmptyGated = !ok && ev.gate !== 'empty';
  return {
    marks,
    useMark,
    meaningMark,
    needsReview: ev.confidence < 0.6 || marks === 1 || nonEmptyGated,
    detail: { gate: ev.gate, errorCodes: [...codes], confidence: ev.confidence, rubric: { ...ev.rubric }, evaluator: ev.evaluator },
  };
}

/** final = override ?? auto (auto defaults to 0 before marking). */
export function finalMarks(auto: number | null | undefined, override: number | null | undefined): number {
  return override ?? auto ?? 0;
}
