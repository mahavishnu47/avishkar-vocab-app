/**
 * Server-authoritative scoring from stored rows, using @shabd/core. OWNER: Lane A (server).
 */
import {
  EMPTY_STREAK, SCORING_VERSION, computeXp, levelFor, scoreMeaning, scoreSentence, scoreSpelling, scoreWord, updateStreak, weekStart,
  type SentenceScoreInput, type SessionSummaryRes, type SpellingHint, type StreakState, type WordScore, type XpBreakdown,
} from '@shabd/core';
import type { Queryable } from '../db/db.ts';
import { HttpError, badRequest, notFound } from '../http.ts';

type Row = Record<string, unknown>;

export async function getStreak(db: Queryable, studentId: number): Promise<StreakState> {
  const r = await db.get<{ current: number; best: number; last_completed_date: string | null }>(
    'SELECT current, best, last_completed_date FROM streaks WHERE student_id = ?',
    [studentId],
  );
  return r ? { current: r.current, best: r.best, lastCompletedDate: r.last_completed_date } : { ...EMPTY_STREAK };
}

export async function xpTotal(db: Queryable, studentId: number): Promise<number> {
  return Number((await db.get<{ n: number }>('SELECT COALESCE(SUM(amount), 0) AS n FROM xp_ledger WHERE student_id = ?', [studentId]))!.n);
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
export async function completeWord(db: Queryable, sessionId: number, wordId: string): Promise<WordScore> {
  const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) throw notFound('Session not found');
  const position = sessionWordIds(session).indexOf(wordId) + 1;
  if (position === 0) throw badRequest('That word is not part of this session');
  const studentId = session.student_id as number;

  const spell = await db.all<{ attempt_no: number; is_correct: number; hints_json: string }>(
    "SELECT attempt_no, is_correct, hints_json FROM word_attempts WHERE session_id = ? AND word_id = ? AND stage = 'spell' ORDER BY attempt_no",
    [sessionId, wordId],
  );
  const firstSpell = spell.find((a) => a.is_correct === 1);
  const hints = new Set<SpellingHint>();
  for (const a of spell) for (const h of JSON.parse(a.hints_json) as SpellingHint[]) hints.add(h);
  const spelling = scoreSpelling({ correctOnAttempt: (firstSpell?.attempt_no ?? null) as 1 | 2 | 3 | null, hints: [...hints] });

  const meaningRows = await db.all<{ attempt_no: number }>(
    "SELECT attempt_no FROM word_attempts WHERE session_id = ? AND word_id = ? AND stage = 'meaning' AND is_correct = 1 ORDER BY attempt_no",
    [sessionId, wordId],
  );
  const meaning = scoreMeaning((meaningRows[0]?.attempt_no ?? null) as 1 | 2 | null);

  const subs = await db.all(
    'SELECT submission_no, r_use, r_grammar, r_relevance, r_length, hint_cost FROM sentence_submissions WHERE session_id = ? AND word_id = ? AND counted = 1 ORDER BY submission_no',
    [sessionId, wordId],
  );
  const inputs: SentenceScoreInput[] = subs.map((s) => ({
    submissionNo: s.submission_no as 1 | 2,
    rubric: { use: s.r_use as number, grammar: s.r_grammar as number, relevance: s.r_relevance as number, length: s.r_length as number },
    starterHintUsed: (s.hint_cost as number) > 0,
  }));
  const sentence = scoreSentence(inputs);

  const score = scoreWord(wordId, spelling, meaning, sentence);
  await db.run(
    `INSERT INTO word_scores (session_id, student_id, word_id, position, spelling, meaning, sentence, total, stars, spell_first_try, scoring_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, word_id) DO UPDATE SET spelling = excluded.spelling, meaning = excluded.meaning,
       sentence = excluded.sentence, total = excluded.total, stars = excluded.stars, spell_first_try = excluded.spell_first_try,
       scoring_version = excluded.scoring_version`,
    [sessionId, studentId, wordId, position, score.spelling, score.meaning, score.sentence, score.total, score.stars,
      firstSpell?.attempt_no === 1 ? 1 : 0, SCORING_VERSION],
  );
  return score;
}

export async function storedWordScores(db: Queryable, sessionId: number): Promise<WordScore[]> {
  const rows = await db.all('SELECT word_id, spelling, meaning, sentence, total, stars FROM word_scores WHERE session_id = ? ORDER BY position', [sessionId]);
  return rows.map((r) => ({
    wordId: r.word_id as string, spelling: r.spelling as number, meaning: r.meaning as number,
    sentence: r.sentence as number, total: r.total as number, stars: r.stars as WordScore['stars'],
  }));
}

async function ledgerBreakdown(db: Queryable, sessionId: number): Promise<XpBreakdown> {
  const rows = await db.all<{ source: string; amount: number }>('SELECT source, amount FROM xp_ledger WHERE ref_session_id = ?', [sessionId]);
  const by = (s: string) => rows.find((r) => r.source === s)?.amount ?? 0;
  const b = { wordMarks: by('word'), completionBonus: by('completion'), streakBonus: by('streak'), perfectBonus: by('perfect'), total: 0 };
  b.total = b.wordMarks + b.completionBonus + b.streakBonus + b.perfectBonus;
  return b;
}

async function buildSummary(db: Queryable, session: Row, xp: XpBreakdown): Promise<SessionSummaryRes> {
  const sessionId = session.id as number;
  const studentId = session.student_id as number;
  const total = await xpTotal(db, studentId);
  return {
    sessionId,
    date: session.date as string,
    wordScores: await storedWordScores(db, sessionId),
    totalMarks: (session.total_marks as number | null) ?? 0,
    xp,
    streak: await getStreak(db, studentId),
    xpTotal: total,
    level: levelFor(total),
  };
}

/**
 * Finish a session: ensure all 5 word scores exist (missing words score whatever is stored, possibly 0),
 * set completed_at/total_marks, update streak (updateStreak with session.date), write xp_ledger rows
 * (idempotent via UNIQUE(ref_session_id, source)), return the summary. Completing twice returns the same summary.
 */
export async function completeSession(db: Queryable, sessionId: number): Promise<SessionSummaryRes> {
  return db.tx(async (q): Promise<SessionSummaryRes> => {
    // Row lock: a concurrent completion of the same session waits here, then sees completed_at and returns the stored summary.
    let session = await q.get('SELECT * FROM sessions WHERE id = ? FOR UPDATE', [sessionId]);
    if (!session) throw notFound('Session not found');
    if (session.completed_at) return buildSummary(q, session, await ledgerBreakdown(q, sessionId));

    const studentId = session.student_id as number;
    const date = session.date as string;
    // A day can only be finished once every word is finished. Opening the summary early (bookmark, Back, typed link)
    // used to score the unplayed words 0, add a streak day and lock the child out of playing (K-1).
    const have = new Set((await storedWordScores(q, sessionId)).map((s) => s.wordId));
    const missing = sessionWordIds(session).filter((id) => !have.has(id));
    if (missing.length > 0) throw new HttpError(409, 'conflict', 'Finish all 5 words first');
    const wordScores = await storedWordScores(q, sessionId);
    const totalMarks = wordScores.reduce((n, s) => n + s.total, 0);

    // Streak counts calendar days; a late sync of an older day never rewinds a newer streak.
    const prev = await getStreak(q, studentId);
    const streak = prev.lastCompletedDate !== null && date < prev.lastCompletedDate ? prev : updateStreak(prev, date);
    await q.run(
      `INSERT INTO streaks (student_id, current, best, last_completed_date) VALUES (?, ?, ?, ?)
       ON CONFLICT(student_id) DO UPDATE SET current = excluded.current, best = excluded.best, last_completed_date = excluded.last_completed_date`,
      [studentId, streak.current, streak.best, streak.lastCompletedDate],
    );

    const xp = computeXp({ wordScores, completed: true, streakAfter: streak.current, isCatchUp: false });
    const wk = weekStart(date);
    const ins = (source: string, amount: number) =>
      q.run(
        'INSERT INTO xp_ledger (student_id, date, week_start, source, amount, ref_session_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (ref_session_id, source) DO NOTHING',
        [studentId, date, wk, source, amount, sessionId],
      );
    await ins('word', xp.wordMarks);
    await ins('completion', xp.completionBonus);
    await ins('streak', xp.streakBonus);
    await ins('perfect', xp.perfectBonus);

    await q.run('UPDATE sessions SET completed_at = iso_now(), total_marks = ?, xp_awarded = ? WHERE id = ?', [totalMarks, xp.total, sessionId]);
    session = (await q.get('SELECT * FROM sessions WHERE id = ?', [sessionId]))!;
    return buildSummary(q, session, xp);
  });
}

/** Summary of an already-completed session (used by teacher student-detail). */
export async function completedSessionSummary(db: Queryable, session: Row): Promise<SessionSummaryRes> {
  return buildSummary(db, session, await ledgerBreakdown(db, session.id as number));
}
