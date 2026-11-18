/**
 * Server-authoritative scoring from stored rows, using @shabd/core. OWNER: Lane A (server).
 */
import {
  EMPTY_STREAK, SCORING_VERSION, computeXp, levelFor, scoreMeaning, scoreSentence, scoreSpelling, scoreWord, updateStreak, weekStart,
  type SentenceScoreInput, type SessionSummaryRes, type SpellingHint, type StreakState, type WordScore, type XpBreakdown,
} from '@shabd/core';
import type { DB } from '../db/db.ts';
import { badRequest, notFound } from '../http.ts';

type Row = Record<string, unknown>;

export function getStreak(db: DB, studentId: number): StreakState {
  const r = db.prepare('SELECT current, best, last_completed_date FROM streaks WHERE student_id = ?').get(studentId) as
    | { current: number; best: number; last_completed_date: string | null } | undefined;
  return r ? { current: r.current, best: r.best, lastCompletedDate: r.last_completed_date } : { ...EMPTY_STREAK };
}

export function xpTotal(db: DB, studentId: number): number {
  return (db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM xp_ledger WHERE student_id = ?').get(studentId) as { n: number }).n;
}

export function sessionWordIds(row: Row): string[] {
  return JSON.parse(row.word_ids_json as string) as string[];
}

/**
 * Compute + upsert word_scores for one word of a session from stored attempts:
 *  spelling: first correct spell attempt_no (1..3) else null; hints = union of hints_json over spell attempts
 *  meaning:  first correct meaning attempt_no (1..2) else null
 *  sentence: scoreSentence over counted submissions
 * Idempotent (recomputes and overwrites).
 */
export function completeWord(db: DB, sessionId: number, wordId: string): WordScore {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Row | undefined;
  if (!session) throw notFound('Session not found');
  const position = sessionWordIds(session).indexOf(wordId) + 1;
  if (position === 0) throw badRequest('That word is not part of this session');
  const studentId = session.student_id as number;

  const spell = db
    .prepare("SELECT attempt_no, is_correct, hints_json FROM word_attempts WHERE session_id = ? AND word_id = ? AND stage = 'spell' ORDER BY attempt_no")
    .all(sessionId, wordId) as { attempt_no: number; is_correct: number; hints_json: string }[];
  const firstSpell = spell.find((a) => a.is_correct === 1);
  const hints = new Set<SpellingHint>();
  for (const a of spell) for (const h of JSON.parse(a.hints_json) as SpellingHint[]) hints.add(h);
  const spelling = scoreSpelling({ correctOnAttempt: (firstSpell?.attempt_no ?? null) as 1 | 2 | 3 | null, hints: [...hints] });

  const meaningRows = db
    .prepare("SELECT attempt_no FROM word_attempts WHERE session_id = ? AND word_id = ? AND stage = 'meaning' AND is_correct = 1 ORDER BY attempt_no")
    .all(sessionId, wordId) as { attempt_no: number }[];
  const meaning = scoreMeaning((meaningRows[0]?.attempt_no ?? null) as 1 | 2 | null);

  const subs = db
    .prepare('SELECT submission_no, r_use, r_grammar, r_relevance, r_length, hint_cost FROM sentence_submissions WHERE session_id = ? AND word_id = ? AND counted = 1 ORDER BY submission_no')
    .all(sessionId, wordId) as Row[];
  const inputs: SentenceScoreInput[] = subs.map((s) => ({
    submissionNo: s.submission_no as 1 | 2,
    rubric: { use: s.r_use as number, grammar: s.r_grammar as number, relevance: s.r_relevance as number, length: s.r_length as number },
    starterHintUsed: (s.hint_cost as number) > 0,
  }));
  const sentence = scoreSentence(inputs);

  const score = scoreWord(wordId, spelling, meaning, sentence);
  db.prepare(
    `INSERT INTO word_scores (session_id, student_id, word_id, position, spelling, meaning, sentence, total, stars, spell_first_try, scoring_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, word_id) DO UPDATE SET spelling = excluded.spelling, meaning = excluded.meaning,
       sentence = excluded.sentence, total = excluded.total, stars = excluded.stars, spell_first_try = excluded.spell_first_try,
       scoring_version = excluded.scoring_version`,
  ).run(sessionId, studentId, wordId, position, score.spelling, score.meaning, score.sentence, score.total, score.stars,
    firstSpell?.attempt_no === 1 ? 1 : 0, SCORING_VERSION);
  return score;
}

export function storedWordScores(db: DB, sessionId: number): WordScore[] {
  const rows = db
    .prepare('SELECT word_id, spelling, meaning, sentence, total, stars FROM word_scores WHERE session_id = ? ORDER BY position')
    .all(sessionId) as Row[];
  return rows.map((r) => ({
    wordId: r.word_id as string, spelling: r.spelling as number, meaning: r.meaning as number,
    sentence: r.sentence as number, total: r.total as number, stars: r.stars as WordScore['stars'],
  }));
}

function ledgerBreakdown(db: DB, sessionId: number): XpBreakdown {
  const rows = db.prepare('SELECT source, amount FROM xp_ledger WHERE ref_session_id = ?').all(sessionId) as { source: string; amount: number }[];
  const by = (s: string) => rows.find((r) => r.source === s)?.amount ?? 0;
  const b = { wordMarks: by('word'), completionBonus: by('completion'), streakBonus: by('streak'), perfectBonus: by('perfect'), total: 0 };
  b.total = b.wordMarks + b.completionBonus + b.streakBonus + b.perfectBonus;
  return b;
}

function buildSummary(db: DB, session: Row, xp: XpBreakdown): SessionSummaryRes {
  const sessionId = session.id as number;
  const studentId = session.student_id as number;
  const total = xpTotal(db, studentId);
  return {
    sessionId,
    date: session.date as string,
    wordScores: storedWordScores(db, sessionId),
    totalMarks: (session.total_marks as number | null) ?? 0,
    xp,
    streak: getStreak(db, studentId),
    xpTotal: total,
    level: levelFor(total),
  };
}

/**
 * Finish a session: ensure all 5 word scores exist (missing words score whatever is stored, possibly 0),
 * set completed_at/total_marks, update streak (updateStreak with session.date), write xp_ledger rows
 * (idempotent via UNIQUE(ref_session_id, source)), return the summary. Completing twice returns the same summary.
 */
export function completeSession(db: DB, sessionId: number): SessionSummaryRes {
  return db.transaction((): SessionSummaryRes => {
    let session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Row | undefined;
    if (!session) throw notFound('Session not found');
    if (session.completed_at) return buildSummary(db, session, ledgerBreakdown(db, sessionId));

    const studentId = session.student_id as number;
    const date = session.date as string;
    const have = new Set(storedWordScores(db, sessionId).map((s) => s.wordId));
    for (const id of sessionWordIds(session)) if (!have.has(id)) completeWord(db, sessionId, id);
    const wordScores = storedWordScores(db, sessionId);
    const totalMarks = wordScores.reduce((n, s) => n + s.total, 0);

    // Streak counts calendar days; a late sync of an older day never rewinds a newer streak.
    const prev = getStreak(db, studentId);
    const streak = prev.lastCompletedDate !== null && date < prev.lastCompletedDate ? prev : updateStreak(prev, date);
    db.prepare(
      `INSERT INTO streaks (student_id, current, best, last_completed_date) VALUES (?, ?, ?, ?)
       ON CONFLICT(student_id) DO UPDATE SET current = excluded.current, best = excluded.best, last_completed_date = excluded.last_completed_date`,
    ).run(studentId, streak.current, streak.best, streak.lastCompletedDate);

    const xp = computeXp({ wordScores, completed: true, streakAfter: streak.current, isCatchUp: false });
    const ins = db.prepare('INSERT OR IGNORE INTO xp_ledger (student_id, date, week_start, source, amount, ref_session_id) VALUES (?, ?, ?, ?, ?, ?)');
    const wk = weekStart(date);
    ins.run(studentId, date, wk, 'word', xp.wordMarks, sessionId);
    ins.run(studentId, date, wk, 'completion', xp.completionBonus, sessionId);
    ins.run(studentId, date, wk, 'streak', xp.streakBonus, sessionId);
    ins.run(studentId, date, wk, 'perfect', xp.perfectBonus, sessionId);

    db.prepare("UPDATE sessions SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), total_marks = ?, xp_awarded = ? WHERE id = ?")
      .run(totalMarks, xp.total, sessionId);
    session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Row;
    return buildSummary(db, session, xp);
  })();
}

/** Summary of an already-completed session (used by teacher student-detail). */
export function completedSessionSummary(db: DB, session: Row): SessionSummaryRes {
  return buildSummary(db, session, ledgerBreakdown(db, session.id as number));
}
