/**
 * "My Progress" contract for children (GET /api/student/progress). Kid-facing: stars and friendly labels, never assessment marks.
 */
import type { IsoDate, LevelInfo } from './types.ts';

export type SkillKey = 'spelling' | 'meaning' | 'wordType' | 'sentence';
export type SkillLabel = 'Super' | 'Good' | 'Keep practising';

/** A skill percentage at/above `super` is "Super", at/above `good` is "Good", otherwise "Keep practising". */
export const SKILL_THRESHOLDS = { super: 80, good: 50 } as const;
/** A word whose latest total is below this (out of 100) goes on the "words to practise" list. */
export const WEAK_WORD_BELOW = 60;
export const PROGRESS_DAYS = 14;
export const PROGRESS_MAX_WEAK_WORDS = 5;
export const PROGRESS_MAX_SESSIONS = 7;

export function skillLabel(percent: number): SkillLabel {
  if (percent >= SKILL_THRESHOLDS.super) return 'Super';
  if (percent >= SKILL_THRESHOLDS.good) return 'Good';
  return 'Keep practising';
}

export interface ProgressDay {
  date: IsoDate;
  played: boolean;
  /** 0-5 */
  wordsDone: number;
  /** sum of word stars that day (0-15); null when not played */
  stars: number | null;
  /** 0-100 average word score; null when not played */
  percent: number | null;
}

export interface ProgressSkill {
  key: SkillKey;
  percent: number;
  label: SkillLabel;
}

export interface ProgressWeakWord { wordId: string; word: string; stars: number }

export interface ProgressSession { sessionId: number; date: IsoDate; wordsDone: number; stars: number }

export interface StudentProgressRes {
  totals: {
    daysPlayed: number;
    wordsLearned: number;
    currentStreak: number;
    bestStreak: number;
    xp: number;
    level: LevelInfo;
    /** 0-100 progress inside the current level */
    levelPercent: number;
    xpToNextLevel: number;
  };
  /** oldest first, exactly PROGRESS_DAYS entries ending today */
  days: ProgressDay[];
  /** only skills with data, in the order spelling, meaning, wordType, sentence */
  skills: ProgressSkill[];
  wordsToPractise: ProgressWeakWord[];
  /** newest first */
  recentSessions: ProgressSession[];
}
