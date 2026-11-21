/**
 * F9: classroom observation checklist (6 yes/no indicators) and end-of-study student feedback questionnaire
 * (5 items, Yes / To some extent / No). No free-text fields anywhere, so no personal data can slip in.
 */

export const OBSERVATION_INDICATORS = [
  { key: 'accesses', label: 'Accesses the app regularly' },
  { key: 'meanings', label: 'Understands word meanings' },
  { key: 'pos', label: 'Identifies parts of speech correctly' },
  { key: 'sentences', label: 'Constructs own sentences' },
  { key: 'participates', label: 'Participates actively' },
  { key: 'revises', label: 'Revises earlier words' },
] as const;
export type ObservationKey = (typeof OBSERVATION_INDICATORS)[number]['key'];
export const OBSERVATION_KEYS: readonly ObservationKey[] = OBSERVATION_INDICATORS.map((i) => i.key);
export const OBSERVATION_MAX_WEEK = 8;

export const FEEDBACK_ITEMS = [
  { itemNo: 1, text: 'I enjoyed learning new words with the app.' },
  { itemNo: 2, text: 'The app helped me understand word meanings.' },
  { itemNo: 3, text: 'I can tell if a word is a noun, verb, adjective or adverb.' },
  { itemNo: 4, text: 'I can write my own sentences with new words.' },
  { itemNo: 5, text: 'I want to keep learning words this way.' },
] as const;
export const FEEDBACK_ITEM_COUNT = FEEDBACK_ITEMS.length;

export const FEEDBACK_ANSWERS = ['yes', 'some', 'no'] as const;
export type FeedbackAnswer = (typeof FEEDBACK_ANSWERS)[number];
export const FEEDBACK_ANSWER_LABEL: Record<FeedbackAnswer, string> = { yes: 'Yes', some: 'To some extent', no: 'No' };
export type FeedbackSource = 'app' | 'paper';

// ---------- observations (teacher) ----------

/** true = Yes, false = No, null = not observed. */
export type ObservationValues = Record<ObservationKey, boolean | null>;

export interface ObservationRow {
  studentId: number;
  studyCode: string;
  classId: number;
  className: string;
  rollNo: number;
  firstName: string;
  values: ObservationValues;
  observedOn: string | null;
}
export interface ObservationsRes { studyId: number; week: number; rows: ObservationRow[] }
/** Partial update: only the keys present are changed (null clears an indicator). */
export interface PutObservationReq { studentId: number; week?: number; values: Partial<ObservationValues>; observedOn?: string }

// ---------- feedback ----------

export interface FeedbackAnswerWrite { itemNo: number; answer: FeedbackAnswer }
export interface FeedbackWindow { open: boolean; openedAt: string | null; closedAt: string | null }
export interface FeedbackRow {
  studentId: number;
  studyCode: string;
  classId: number;
  className: string;
  rollNo: number;
  firstName: string;
  /** Index 0 = item 1; null = unanswered. */
  answers: (FeedbackAnswer | null)[];
  source: FeedbackSource | null;
}
export interface FeedbackRes extends FeedbackWindow { studyId: number; rows: FeedbackRow[]; summary: InstrumentSummary['feedback'] }
export interface PatchFeedbackWindowReq { open: boolean }
export interface PutFeedbackReq { answers: FeedbackAnswerWrite[] }
export interface StudentFeedbackRes {
  open: boolean;
  items: { itemNo: number; text: string }[];
  /** Index 0 = item 1; null = unanswered. */
  answers: (FeedbackAnswer | null)[];
}
export interface PostFeedbackReq { answers: FeedbackAnswerWrite[] }

// ---------- summary (used by F8) ----------

export interface ObservationIndicatorSummary { key: ObservationKey; label: string; yes: number; no: number; notObserved: number }
export interface ObservationWeekSummary { week: number; indicators: ObservationIndicatorSummary[] }
export interface FeedbackItemSummary { itemNo: number; text: string; yes: number; some: number; no: number; n: number; pctYes: number; pctSome: number; pctNo: number }
/** Counts cover analysable participants only (consent given, not excluded); no identifiers. */
export interface InstrumentSummary {
  studyId: number;
  participants: number;
  observation: { weeks: ObservationWeekSummary[] };
  feedback: { respondents: number; items: FeedbackItemSummary[] };
}
