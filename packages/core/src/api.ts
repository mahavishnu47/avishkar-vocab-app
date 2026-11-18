/**
 * REST API request/response types. Mirrors docs/API.md exactly.
 * Used by server route handlers AND apps/web/src/shared/api.ts.
 * Contract file: change only via a coordinated contract commit.
 */
import type {
  ClassRoom, DailySet, IsoDate, LeaderboardMode, LevelInfo, MeaningAttemptInput, PartOfSpeech, Difficulty,
  Rubric, SentenceEvaluation, SentenceSubmissionInput, SpellAttemptInput, SpellingClassification,
  StreakState, Student, StudentWithPin, Teacher, Word, WordScore, XpBreakdown,
} from './types.ts';
import type { SentenceErrorCode, SpellingErrorCode } from './taxonomy.ts';

/** Every non-2xx response body. */
export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
export type ApiErrorCode =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'locked' | 'not_implemented' | 'internal';

// ------------------------------------------------------------------ health
export interface HealthRes { ok: true; ai: boolean; version: string }

// ------------------------------------------------------------------ auth
export interface TeacherRegisterReq { name: string; email: string; password: string; inviteCode?: string }
export interface TeacherLoginReq { email: string; password: string }
export interface TeacherAuthRes { token: string; teacher: Teacher }

export interface PublicRosterRes {
  className: string;
  students: Pick<Student, 'id' | 'firstName' | 'avatar'>[];
}
export interface StudentLoginReq { classCode: string; studentId: number; pin: string }
export interface StudentAuthRes { token: string; student: Student; className: string }

export type MeRes =
  | { role: 'teacher'; teacher: Teacher }
  | { role: 'student'; student: Student; classRoom: Pick<ClassRoom, 'id' | 'name' | 'leaderboardMode'> };

// ------------------------------------------------------------------ classes & roster (teacher)
export interface CreateClassReq { name: string; startDate?: IsoDate }
export interface UpdateClassReq { name?: string; startDate?: IsoDate; leaderboardMode?: LeaderboardMode }
export interface AddStudentsReq { students: { rollNo: number; firstName: string }[] }
export interface UpdateStudentReq { firstName?: string; rollNo?: number; avatar?: string; active?: boolean }
export type RosterRes = StudentWithPin[];

// ------------------------------------------------------------------ words (teacher)
export interface WordSearchQuery {
  q?: string;
  difficulty?: Difficulty;
  partOfSpeech?: PartOfSpeech;
  tag?: string;
  dayIndex?: number;
  limit?: number; // default 50, max 200
  offset?: number;
}
export interface WordSearchRes { total: number; items: Word[] }
/** Custom teacher word. Same fields as a content entry minus id/dayIndex. */
export type CreateWordReq = Omit<Word, 'id' | 'dayIndex' | 'source'>;
export interface SetDailyWordsReq { wordIds: string[] } // exactly 5, distinct

// ------------------------------------------------------------------ analytics (teacher)
export type DayStatus = 'not_started' | 'in_progress' | 'completed';

export interface StudentDayRow {
  studentId: number;
  rollNo: number;
  firstName: string;
  avatar: string;
  status: DayStatus;
  wordsDone: number; // 0..5
  totalMarks: number | null; // 0..500, null if not started
  streak: number;
  xpWeek: number;
}

export interface ClassDashboardRes {
  date: IsoDate;
  dayIndex: number;
  set: DailySet;
  completedCount: number;
  students: StudentDayRow[];
}

export interface LeaderboardEntry {
  rank: number;
  studentId: number;
  firstName: string;
  avatar: string;
  xp: number;
  isMe?: boolean;
}
export interface LeaderboardRes {
  period: 'week' | 'all';
  weekStart: IsoDate;
  mode: LeaderboardMode;
  /** top 10 (students see top 10; teachers see everyone) */
  entries: LeaderboardEntry[];
  /** the requesting student's own row, even if outside top 10 */
  me?: LeaderboardEntry;
}

export interface StudentErrorProfile {
  studentId: number;
  firstName: string;
  avatar: string;
  sessionsCompleted: number;
  spellingWords: number; // words with >= 1 spelling attempt
  /** % of words spelt correctly on attempt 1 (0..100), null if no data. "Spelling Strength" */
  spellingStrength: number | null;
  /** mean scored sentence rawTotal / 40 * 100 (0..100), null if none. "Sentence Strength" */
  sentenceStrength: number | null;
  /** counts of PRIMARY tag over wrong spelling attempts */
  spellingErrorCounts: Partial<Record<SpellingErrorCode, number>>;
  /** counts over scored + gated sentence submissions */
  sentenceErrorCounts: Partial<Record<SentenceErrorCode, number>>;
  rubricAverages: Rubric | null;
  /**
   * <= 2 labels like 'Needs support: Silent letters'. A category qualifies when the student has
   * >= 10 relevant events and the category rate >= 1.5x the class rate.
   */
  weaknessLabels: string[];
}

export interface HardWord { wordId: string; word: string; attempts: number; firstAttemptAccuracy: number }

export interface ClassAnalyticsRes {
  from: IsoDate;
  to: IsoDate;
  students: StudentErrorProfile[];
  /** class-level rate per category (events with that primary code / all relevant events), 0..1 */
  classSpellingRates: Partial<Record<SpellingErrorCode, number>>;
  classSentenceRates: Partial<Record<SentenceErrorCode, number>>;
  hardestWords: HardWord[]; // lowest first-attempt accuracy, max 10
}

export interface SpellingErrorExample {
  date: IsoDate; word: string; input: string; attemptNo: number; primary: SpellingErrorCode; tags: SpellingErrorCode[];
}
export interface SentenceExample {
  date: IsoDate; word: string; text: string; submissionNo: number; rubric: Rubric; finalMarks: number | null;
  errorCodes: SentenceErrorCode[]; evaluator: string; tip?: string;
}
export interface StudentDetailRes {
  student: StudentWithPin;
  profile: StudentErrorProfile;
  sessions: SessionSummaryRes[]; // last 14, newest first
  spellingErrors: SpellingErrorExample[]; // last 30 wrong attempts
  sentences: SentenceExample[]; // last 30 submissions
}

// ------------------------------------------------------------------ student flow
export interface StudentHomeRes {
  student: Student;
  className: string;
  leaderboardMode: LeaderboardMode;
  today: { date: IsoDate; dayIndex: number; status: DayStatus; wordsDone: number; sessionId: number | null };
  streak: number; // display streak
  bestStreak: number;
  xpTotal: number;
  xpWeek: number;
  level: LevelInfo;
}

export interface SessionInfo {
  id: number;
  date: IsoDate;
  dayIndex: number;
  startedAt: string;
  completedAt: string | null;
}

/** Server-side progress for resume. Fine-grained in-stage state lives in client localStorage. */
export interface SessionProgress {
  /** words with a stored WordScore (fully finished), in order */
  completedWordIds: string[];
  wordScores: WordScore[];
}

export interface TodaySessionRes {
  session: SessionInfo;
  /** exactly 5 words in order */
  words: Word[];
  progress: SessionProgress;
}

export interface AttemptsReq { spell?: SpellAttemptInput[]; meaning?: MeaningAttemptInput[] }
export interface AttemptsRes {
  /** clientIds stored (or already stored - idempotent) */
  accepted: string[];
  /** server classification for each spell attempt clientId */
  classifications: Record<string, SpellingClassification>;
}

export type SentenceReq = SentenceSubmissionInput;
export interface SentenceRes {
  evaluation: SentenceEvaluation;
  /** false when gate !== 'ok' (child may try again without losing a submission) */
  counted: boolean;
  /** marks for this submission after multiplier & hint, null if not counted */
  finalMarks: number | null;
}

/** POST .../words/:wordId/complete has an empty body; server derives everything from stored rows. */
export type CompleteWordRes = WordScore;

export interface SessionSummaryRes {
  sessionId: number;
  date: IsoDate;
  wordScores: WordScore[];
  totalMarks: number;
  xp: XpBreakdown;
  streak: StreakState;
  xpTotal: number;
  level: LevelInfo;
}
