/**
 * Daily word set resolution. OWNER: Lane A (server).
 */
import type { DailySet, IsoDate, Word } from '@shabd/core';
import type { DB } from '../db/db.ts';

/**
 * The 5 words for (class, date): teacher overrides if present (source 'teacher'),
 * else bank words with day_index = dayIndexFor(class.startDate, date) ordered by id (source 'auto').
 * If the bank has < 5 words for that day (content not loaded yet), fill from the nearest
 * lower dayIndex that has words; throws HttpError 404 if the bank is empty.
 */
export function getDailySet(db: DB, classId: number, date: IsoDate): DailySet {
  void db; void classId; void date;
  throw new Error('not implemented');
}

/** Map a `words` row to the API Word shape (parses *_json columns). */
export function rowToWord(row: Record<string, unknown>): Word {
  void row;
  throw new Error('not implemented');
}
