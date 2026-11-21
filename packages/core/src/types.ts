/**
 * Shared domain types. This file is THE CONTRACT between lanes.
 * Changing it requires a coordinated "contract" commit (see docs/BUILD_PLAN.md).
 * FROZEN by O1 (onboarding v2, docs/ONBOARDING_SPEC.md 6.1): lanes O2-O6 must not edit; report needed changes to the integrator.
 */
import type { SpellingErrorCode, SentenceErrorCode, MeaningErrorCode } from './taxonomy.ts';
import type { SpellingHint } from './scoring.config.ts';

// ---------------------------------------------------------------- primitives
/** ISO calendar date in Asia/Kolkata, 'YYYY-MM-DD'. */
export type IsoDate = string;
/** ISO timestamp, e.g. new Date().toISOString(). */
export type IsoDateTime = string;
export type Difficulty = 1 | 2 | 3;
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'pronoun' | 'interjection';

// ---------------------------------------------------------------- content
/** One word entry exactly as stored in content/words/part-NN.json (see docs/CONTENT_SPEC.md). */
export interface WordEntry {
  /** 'd001-1' .. 'd366-5' (day, slot). Stable primary key. */
  id: string;
  /** 1..366 */
  dayIndex: number;
  /** lowercase a-z only, 3-14 letters, single word */
  word: string;
  partOfSpeech: PartOfSpeech;
  difficulty: Difficulty;
  /** simple English meaning, <= 12 words, must not contain the word itself */
  meaning: string;
  /** Marathi gloss in Devanagari */
  meaningMarathi?: string; // unused: MVP is English-only
  /** 6-14 words, contains the word (or an inflection), starts with capital, ends with . ! or ? */
  exampleSentence: string;
  /** exactly 2 wrong-but-plausible meanings for the 3-option check */
  distractorMeanings: [string, string];
  /** syllable split; syllables.join('') === word */
  syllables: string[];
  /** theme tags from the allowed theme list (CONTENT_SPEC section 4), 1-3 entries */
  tags: string[];
  /** 3-6 lowercase words that commonly appear near this word; feeds sentence relevance (R3) */
  contextWords: string[];
  /** optional irregular / extra accepted forms (e.g. run -> ['ran','running']); regular -s/-ed/-ing are generated */
  forms?: string[];
}

/** A word as served by the API (bank word or teacher custom word). */
export interface Word extends Omit<WordEntry, 'dayIndex' | 'id'> {
  id: string;
  /** null for teacher custom words */
  dayIndex: number | null;
  source: 'bank' | 'teacher';
}

// ---------------------------------------------------------------- people
export type LeaderboardMode = 'individual' | 'hidden';

export type StaffRole = 'teacher' | 'school_admin';

export interface School {
  id: number;
  name: string;
  district: string;
  /** 6-char code used in /s/<code> links */
  studentCode: string;
  status: 'active' | 'suspended';
}

export interface Teacher {
  id: number;
  name: string;
  email: string;
  schoolId: number;
  role: StaffRole;
  active: boolean;
}

export interface ClassRoom {
  id: number;
  teacherId: number;
  /** e.g. '5A' */
  name: string;
  /** 6-char uppercase code printed on login cards, e.g. 'K7Q2MX' */
  classCode: string;
  /** date that maps to content day 1 (dayIndex = days since startDate + 1, wraps after 366) */
  startDate: IsoDate;
  leaderboardMode: LeaderboardMode;
  schoolId: number;
  standard: number;
  /** '' or 1-3 uppercase characters */
  division: string;
  /** e.g. '2026-27' (June-May) */
  academicYear: string;
  archived: boolean;
  joinEnabled: boolean;
  linkSharedAt: string | null;
  consentAttestedAt: string | null;
}

export interface Student {
  id: number;
  classId: number;
  rollNo: number;
  firstName: string;
  /** emoji avatar, e.g. '🦁' */
  avatar: string;
  active: boolean;
}

/** Teacher-only view of a student, includes PIN for login cards. */
export interface StudentWithPin extends Student {
  /** 4 digits, e.g. '0427' */
  pin: string;
}

/** Roster row for teachers: PIN plus join/lock state. */
export interface RosterStudent extends StudentWithPin {
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  locked: boolean;
}

// ---------------------------------------------------------------- daily set
export interface DailySet {
  classId: number;
  date: IsoDate;
  dayIndex: number;
  /** 'auto' = picked from bank by dayIndex; 'teacher' = teacher override for that date */
  source: 'auto' | 'teacher';
  words: Word[]; // always exactly 5, ordered by position 1..5
}

// ---------------------------------------------------------------- attempts
export type Stage = 'spell' | 'meaning' | 'sentence';

/** One spelling attempt as captured by the client (Stage 1). */
export interface SpellAttemptInput {
  /** client-generated UUID; makes the upload idempotent */
  clientId: string;
  wordId: string;
  attemptNo: 1 | 2 | 3;
  input: string;
  /** hints active at the moment of this attempt (cumulative) */
  hints: SpellingHint[];
  /** number of times the audio was (re)played before this attempt, research only */
  audioPlays: number;
  msElapsed: number;
  clientTs: IsoDateTime;
}

/** One meaning-check tap (Stage 2). */
export interface MeaningAttemptInput {
  clientId: string;
  wordId: string;
  attemptNo: 1 | 2;
  /** the option text the child tapped */
  chosen: string;
  isCorrect: boolean;
  msElapsed: number;
  clientTs: IsoDateTime;
}

// ---------------------------------------------------------------- spelling classifier
export interface SpellingClassification {
  isCorrect: boolean;
  /** all applicable tags; ['SP_CORRECT'] when correct; ['SP_BLANK'] when blank */
  tags: SpellingErrorCode[];
  /** highest-priority tag (SPELLING_PRIMARY_PRIORITY), or SP_CORRECT / SP_BLANK */
  primary: SpellingErrorCode;
  /** Damerau-Levenshtein distance between normalised target and attempt */
  editDistance: number;
}

// ---------------------------------------------------------------- sentence evaluation
export interface Rubric {
  use: number; // 0 | 5 | 10
  grammar: number; // 0..10
  relevance: number; // 0..12
  length: number; // 0..8
}

/** Why a sentence was not scored (does NOT count as a submission). 'ok' = scored. */
export type SentenceGate = 'ok' | 'empty' | 'word_missing' | 'devanagari' | 'blocked' | 'starter_only';

export type FeedbackKey =
  | 'used_word'
  | 'word_missing'
  | 'word_misspelt'
  | 'capital'
  | 'full_stop'
  | 'long_enough'
  | 'too_short'
  | 'joining_word'
  | 'copied'
  | 'english_letters'
  | 'real_words'
  | 'has_verb'
  | 'blocked';

/** One line of the child-facing checklist, e.g. ✅ "You used the word!" */
export interface FeedbackItem {
  key: FeedbackKey;
  ok: boolean;
  /** short child-friendly English, <= 8 words */
  message: string;
}

export interface SentenceEvaluation {
  gate: SentenceGate;
  /** all zeros when gate !== 'ok' */
  rubric: Rubric;
  /** sum of rubric dimensions, 0..40 (before submission multiplier / hint) */
  rawTotal: number;
  errorCodes: SentenceErrorCode[];
  /** 0..1; < 0.6 means "teacher may want to look" */
  confidence: number;
  feedback: FeedbackItem[];
  /** 'rules-1' for the rule evaluator; 'claude:<model>' when the AI evaluator produced it */
  evaluator: string;
  /** optional one-line encouraging tip (Claude evaluator only) */
  tip?: string;
}

/** What the evaluator needs to know about the target word. */
export type SentenceWordContext = Pick<WordEntry, 'word' | 'partOfSpeech' | 'exampleSentence' | 'contextWords' | 'forms'>;

export interface SentenceSubmissionInput {
  clientId: string;
  wordId: string;
  submissionNo: 1 | 2;
  text: string;
  starterHintUsed: boolean;
  msElapsed: number;
  clientTs: IsoDateTime;
  /** evaluation the client computed offline (rules); the server re-evaluates and is authoritative */
  clientEvaluation?: SentenceEvaluation;
}

// ---------------------------------------------------------------- scoring results
export interface SpellingScoreInput {
  /** attempt number (1..3) on which the word was spelt correctly, or null if never (3 wrong) */
  correctOnAttempt: 1 | 2 | 3 | null;
  /** distinct hints used for this word */
  hints: SpellingHint[];
}

export interface SentenceScoreInput {
  submissionNo: 1 | 2;
  /** scored (gate 'ok') evaluation rubric */
  rubric: Rubric;
  starterHintUsed: boolean;
}

export interface WordScore {
  wordId: string;
  spelling: number; // 0..40
  meaning: number; // 0..20
  sentence: number; // 0..40
  total: number; // 0..100
  stars: 0 | 1 | 2 | 3;
}

// ---------------------------------------------------------------- gamification
export interface StreakState {
  current: number;
  best: number;
  /** last date on which a full set was completed (today mode), null if never */
  lastCompletedDate: IsoDate | null;
}

export interface XpInput {
  wordScores: WordScore[];
  /** all 5 words of the set finished */
  completed: boolean;
  /** streak AFTER this completion was applied */
  streakAfter: number;
  isCatchUp: boolean;
}

export interface XpBreakdown {
  wordMarks: number;
  completionBonus: number;
  streakBonus: number;
  perfectBonus: number;
  total: number;
}

export interface LevelInfo {
  level: number; // 0-based: 0 until levelStep XP
  xpIntoLevel: number;
  /** size of the current level span (XP from this level to the next), e.g. 2710 XP -> level 2, into 1210, span 1500 */
  xpForNextLevel: number;
}

// Re-export for convenience.
export type { SpellingErrorCode, SentenceErrorCode, MeaningErrorCode, SpellingHint };
