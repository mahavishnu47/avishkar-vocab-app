/**
 * Thin wrappers around @shabd/core for LOCAL (instant / offline) feedback.
 * The server stays authoritative. If a core function throws (e.g. not available), we degrade to a
 * neutral result instead of crashing a child's session.
 */
import {
  classifySpellingError, correctPositions, evaluateSentenceRules, scoreSentence, scoreSpelling, scoreMeaning,
  scoreWord, computeXp, updateStreak, displayStreak, addDays, EMPTY_STREAK,
} from '@shabd/core';
import type {
  SentenceEvaluation, SentenceWordContext, SpellingClassification, SpellingHint, WordScore, SentenceScoreInput,
  SessionSummaryRes, StreakState, XpBreakdown,
} from '@shabd/core';

export function localClassify(target: string, attempt: string): SpellingClassification {
  try {
    return classifySpellingError(target, attempt);
  } catch {
    const ok = target.toLowerCase() === attempt.trim().toLowerCase();
    return { isCorrect: ok, tags: [ok ? 'SP_CORRECT' : 'SP_SUBST'], primary: ok ? 'SP_CORRECT' : 'SP_SUBST', editDistance: ok ? 0 : 1 };
  }
}

export function localPositions(target: string, attempt: string): boolean[] {
  try {
    return correctPositions(target, attempt);
  } catch {
    return attempt.split('').map((c, i) => c === target[i]);
  }
}

export function localEvaluate(text: string, word: SentenceWordContext): SentenceEvaluation {
  try {
    return evaluateSentenceRules(text, word);
  } catch {
    const has = text.toLowerCase().includes(word.word.toLowerCase());
    return {
      gate: !text.trim() ? 'empty' : has ? 'ok' : 'word_missing',
      rubric: { use: has ? 10 : 0, grammar: 0, relevance: 0, length: 0 },
      rawTotal: has ? 10 : 0, errorCodes: [], confidence: 0.3, feedback: [], evaluator: 'client-fallback',
    };
  }
}

export interface WordRec {
  correctOn: 1 | 2 | 3 | null;
  hints: SpellingHint[];
  meaningOn: 1 | 2 | null;
  subs: SentenceScoreInput[];
}

export function localWordScore(wordId: string, r: WordRec): WordScore | null {
  try {
    return scoreWord(
      wordId,
      scoreSpelling({ correctOnAttempt: r.correctOn, hints: r.hints }),
      scoreMeaning(r.meaningOn),
      r.subs.length ? scoreSentence(r.subs) : 0,
    );
  } catch { return null; }
}

export function localSentenceMarks(s: SentenceScoreInput): number | null {
  try { return scoreSentence([s]); } catch { return null; }
}

/**
 * Streak state before today's session, rebuilt from the cached home numbers. The home streak is only > 0 when the
 * last completed day was yesterday, so that date is restored; a null date would make updateStreak restart at 1 (B-02).
 */
export function streakBeforeSession(homeStreak: number, bestStreak: number, sessionDate: string): StreakState {
  const current = Math.max(0, homeStreak);
  return { current, best: Math.max(bestStreak, current), lastCompletedDate: current > 0 ? addDays(sessionDate, -1) : null };
}

/** Offline summary computed with core; null if core cannot. */
export function localSummary(
  sessionId: number, date: string, scores: WordScore[], prev: StreakState | null, today: string,
): SessionSummaryRes | null {
  try {
    const streak = updateStreak(prev ?? EMPTY_STREAK, today);
    const xp: XpBreakdown = computeXp({ wordScores: scores, completed: scores.length >= 5, streakAfter: streak.current, isCatchUp: false });
    return {
      sessionId, date, wordScores: scores, totalMarks: scores.reduce((a, s) => a + s.total, 0), xp, streak,
      xpTotal: xp.total, level: { level: 0, xpIntoLevel: 0, xpForNextLevel: 500 },
    };
  } catch { return null; }
}

export { displayStreak };
