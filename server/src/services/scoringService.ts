/**
 * Server-authoritative scoring from stored rows, using @shabd/core. OWNER: Lane A (server).
 */
import type { SessionSummaryRes, WordScore } from '@shabd/core';
import type { DB } from '../db/db.ts';

/**
 * Compute + upsert word_scores for one word of a session from stored attempts:
 *  spelling: first correct spell attempt_no (1..3) else null; hints = union of hints_json over spell attempts
 *  meaning:  first correct meaning attempt_no (1..2) else null
 *  sentence: scoreSentence over counted submissions
 * Idempotent (recomputes and overwrites).
 */
export function completeWord(db: DB, sessionId: number, wordId: string): WordScore {
  void db; void sessionId; void wordId;
  throw new Error('not implemented');
}

/**
 * Finish a session: ensure all 5 word scores exist (missing words score whatever is stored, possibly 0),
 * set completed_at/total_marks, update streak (updateStreak with session.date), write xp_ledger rows
 * (idempotent via UNIQUE(ref_session_id, source)), return the summary. Completing twice returns the same summary.
 */
export function completeSession(db: DB, sessionId: number): SessionSummaryRes {
  void db; void sessionId;
  throw new Error('not implemented');
}
