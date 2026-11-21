/**
 * REST API request/response types. Mirrors docs/API.md exactly.
 * Used by server route handlers AND apps/web/src/shared/api.ts.
 * Contract file: change only via a coordinated contract commit.
 * FROZEN by O1 (onboarding v2, docs/ONBOARDING_SPEC.md 6.1): lanes O2-O6 must not edit; report needed changes to the integrator.
 */
import type {
  ClassRoom, DailySet, IsoDate, LeaderboardMode, LevelInfo, MeaningAttemptInput, PosAttemptInput, PartOfSpeech, Difficulty,
  Rubric, SentenceEvaluation, SentenceSubmissionInput, SpellAttemptInput, SpellingClassification,
  RosterStudent, School, StaffRole, StreakState, Student, StudentWithPin, Teacher, Word, WordScore, XpBreakdown,
} from './types.ts';
import type { SentenceErrorCode, SpellingErrorCode } from './taxonomy.ts';

/** Every non-2xx response body. */
export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
export type ApiErrorCode =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'locked' | 'not_implemented' | 'rate_limited' | 'internal';

// ------------------------------------------------------------------ health
export interface HealthRes { ok: true; ai: boolean; version: string }

// ------------------------------------------------------------------ auth
export type InviteKind = 'school_admin' | 'teacher' | 'password_reset';
export interface Invite {
  id: number;
  kind: InviteKind;
  /** 'ABCD-EFGH' */
  code: string;
  /** absolute URL */
  url: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
}
export interface InviteInfoRes { kind: InviteKind; schoolName: string; expiresAt: string; teacherName?: string }

/** inviteCode is now REQUIRED (the global TEACHER_INVITE_CODE is gone). */
export interface TeacherRegisterReq { inviteCode: string; name: string; email: string; password: string }
export interface TeacherLoginReq { email: string; password: string }
export interface SchoolSetupReq { code: string; name: string; email: string; password: string }
export interface PasswordResetReq { code: string; password: string }
export interface TeacherAuthRes { token: string; teacher: Teacher; school: Pick<School, 'id' | 'name'> }

export interface JoinStudent { id: number; firstName: string; avatar: string; rollNo: number }
export interface JoinClassRes { schoolName: string; classRoom: { name: string; classCode: string }; students: JoinStudent[] }
export interface JoinSchoolRes { schoolName: string; classes: { name: string; classCode: string; standard: number; division: string }[] }

/** Join requests: a child asks to join a class, the class teacher approves or removes the request. */
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export interface CreateJoinRequestReq { firstName: string; rollNo?: number }
export interface CreateJoinRequestRes { requestId: number; secret: string }
export interface JoinRequestStatusRes { status: JoinRequestStatus; firstName: string }
export interface JoinRequest { id: number; firstName: string; requestedRollNo: number | null; createdAt: string }
export interface ApproveJoinRequestReq { rollNo?: number }
/** @deprecated kept for cached old clients */
export interface PublicRosterRes {
  className: string;
  students: Pick<Student, 'id' | 'firstName' | 'avatar'>[];
}
export interface StudentLoginReq { classCode: string; studentId: number; pin: string }
export interface StudentAuthRes {
  token: string;
  student: Student;
  className: string;
  schoolName: string;
  classCode: string;
  /** true on the very first login of this child (show the welcome tutorial) */
  firstLogin: boolean;
}

export type MeRes =
  | { role: 'teacher'; teacher: Teacher; school: Pick<School, 'id' | 'name'> }
  | { role: 'student'; student: Student; classRoom: Pick<ClassRoom, 'id' | 'name' | 'leaderboardMode'>; schoolName: string };

// ------------------------------------------------------------------ classes & roster (teacher)
/** standard or name required */
export interface CreateClassReq { standard?: number; division?: string; name?: string; startDate?: IsoDate }
export interface UpdateClassReq {
  name?: string; startDate?: IsoDate; leaderboardMode?: LeaderboardMode;
  joinEnabled?: boolean; archived?: boolean; linkShared?: true;
}
export interface AddStudentsReq { students: { rollNo: number; firstName: string }[]; consentConfirmed?: boolean }
export interface UpdateStudentReq { firstName?: string; rollNo?: number; avatar?: string; active?: boolean }
export type RosterRes = RosterStudent[];
/** signOutDevices defaults to true */
export interface ResetPinReq { signOutDevices?: boolean }
export interface ShareInfoRes { joinUrl: string; schoolJoinUrl: string; classCode: string; whatsappText: string }

export interface ClassSummary extends ClassRoom { studentCount: number; joinedCount: number; completedToday: number; teacherName: string }
export interface TeacherChecklist { classCreated: boolean; studentsAdded: boolean; linkShared: boolean; firstStudentJoined: boolean; done: boolean }
export interface TeacherOverviewRes {
  teacher: Teacher; school: Pick<School, 'id' | 'name'>; date: IsoDate; classes: ClassSummary[]; checklist: TeacherChecklist;
}

// ------------------------------------------------------------------ school admin
export interface SchoolChecklist { teacherLinkShared: boolean; firstTeacherJoined: boolean; firstClassCreated: boolean; firstStudentPlayed: boolean; done: boolean }
export interface SchoolInfoRes { school: School; studentJoinUrl: string; teacherInvite: Invite | null; checklist: SchoolChecklist }
export interface UpdateMySchoolReq { name?: string; district?: string; teacherLinkShared?: true }
export interface SchoolClassRow {
  classId: number; name: string; standard: number; division: string; teacherId: number; teacherName: string;
  teacherActive: boolean; studentCount: number; joinedCount: number; completedToday: number; weekCompletionPct: number;
  archived: boolean; joinEnabled: boolean;
}
export interface SchoolOverviewRes {
  date: IsoDate;
  totals: { teachers: number; classes: number; students: number; joined: number; completedToday: number };
  classes: SchoolClassRow[];
}
export interface SchoolTeacherRow { id: number; name: string; email: string; role: StaffRole; active: boolean; classCount: number; lastLoginAt: string | null }
export interface UpdateSchoolTeacherReq { active?: boolean; role?: StaffRole }
/** expiresInDays 1-90, default 30 */
export interface CreateInviteReq { expiresInDays?: number; maxUses?: number | null }
/** Invite plus the ready-to-send WhatsApp text (reset links, setup links). */
export type InviteWithText = Invite & { whatsappText: string };
export interface UpdateSchoolClassReq { teacherId?: number; archived?: boolean }
export interface AuditEntry {
  id: number; at: string; actorType: 'super' | 'teacher' | 'student' | 'system'; actorName: string | null;
  action: string; targetType: string | null; targetId: number | null; targetLabel: string | null; meta: Record<string, unknown>;
}

// ------------------------------------------------------------------ super admin
export interface AdminSchoolRow {
  school: School; udiseCode: string | null; teachers: number; classes: number; students: number; createdAt: string;
  /** Students who started a session in the last 7 days (today included). */
  activeStudents7d: number;
  /** Latest session start or finish in the school, ISO, or null. */
  lastActivityAt: string | null;
  lastTeacherLoginAt: string | null;
  /** True when the school has a research study with status 'running'. */
  studyRunning: boolean;
}
export interface AdminDailyPoint { date: string; activeStudents: number; sessionsCompleted: number }
export interface AdminTopSchool { schoolId: number; name: string; activeStudents7d: number; students: number }
export interface AdminOverview {
  totals: {
    schoolsActive: number; schoolsSuspended: number; teachers: number; classes: number; students: number;
    joinRequestsPending: number; studiesRunning: number;
  };
  activity: {
    studentsToday: number; students7d: number; students30d: number;
    sessionsCompletedToday: number; sessionsCompleted7d: number; wordsCompleted7d: number;
  };
  /** 30 entries, oldest first, ending today. */
  daily: AdminDailyPoint[];
  health: { db: 'ok'; migrationsApplied: number; latestMigration: number | null; wordsLoaded: number; appVersion: string; serverTime: string };
  topSchools: AdminTopSchool[];
}
export interface AdminTeacherRow { id: number; name: string; email: string; role: 'teacher' | 'school_admin'; active: boolean; lastLoginAt: string | null }
export interface AdminClassRow { id: number; name: string; classCode: string; students: number; active7d: number; archived: boolean }
export interface AdminActivityEntry {
  id: number; at: string; schoolId: number | null; schoolName: string | null;
  actorType: 'super' | 'teacher' | 'student' | 'system'; action: string; targetType: string | null; targetId: number | null;
}
export interface AdminSchoolDetail { row: AdminSchoolRow; teachers: AdminTeacherRow[]; classes: AdminClassRow[]; recentActivity: AdminActivityEntry[] }
export interface CreateSchoolReq { name: string; district?: string; udiseCode?: string }
export interface CreateSchoolRes { school: School; setupInvite: Invite; whatsappText: string }
export interface AdminUpdateSchoolReq { name?: string; district?: string; status?: 'active' | 'suspended' }

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

export interface AttemptsReq { spell?: SpellAttemptInput[]; meaning?: MeaningAttemptInput[]; pos?: PosAttemptInput[] }
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
