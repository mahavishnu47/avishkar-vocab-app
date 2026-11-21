/**
 * Daily word set resolution. OWNER: Lane A (server).
 */
import { dayIndexFor, type DailySet, type IsoDate, type Word } from '@shabd/core';
import type { Queryable } from '../db/db.ts';
import { HttpError, notFound } from '../http.ts';
import { classStudyDay, planWordIds } from './research/wordplan.ts';

type Row = Record<string, unknown>;

const parse = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === 'string' ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Map a `words` row to the API Word shape (parses *_json columns). */
export function rowToWord(row: Record<string, unknown>): Word {
  return {
    id: row.id as string,
    dayIndex: (row.day_index as number | null) ?? null,
    word: row.word as string,
    partOfSpeech: row.part_of_speech as Word['partOfSpeech'],
    difficulty: row.difficulty as Word['difficulty'],
    meaning: row.meaning as string,
    meaningMarathi: (row.meaning_marathi as string) ?? '',
    exampleSentence: row.example_sentence as string,
    distractorMeanings: parse<[string, string]>(row.distractors_json, ['', '']),
    syllables: parse<string[]>(row.syllables_json, []),
    tags: parse<string[]>(row.tags_json, []),
    contextWords: parse<string[]>(row.context_words_json, []),
    forms: parse<string[]>(row.forms_json, []),
    source: row.source as Word['source'],
  };
}

export async function getWordsByIds(db: Queryable, ids: string[]): Promise<Word[]> {
  if (ids.length === 0) return [];
  const rows = await db.all('SELECT * FROM words WHERE id = ANY(?::text[])', [ids]);
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return ids.map((id) => {
    const r = byId.get(id);
    if (!r) throw notFound(`Word ${id} not found`);
    return rowToWord(r);
  });
}

/**
 * The 5 words for (class, date): teacher overrides if present (source 'teacher'),
 * else bank words with day_index = dayIndexFor(class.startDate, date) ordered by id (source 'auto').
 * If the bank has < 5 words for that day (content not loaded yet), fill from the nearest
 * lower dayIndex that has words; throws HttpError 404 if the bank is empty.
 */
export async function getDailySet(db: Queryable, classId: number, date: IsoDate): Promise<DailySet> {
  const cls = await db.get<{ start_date: string }>('SELECT start_date FROM classes WHERE id = ?', [classId]);
  if (!cls) throw notFound('Class not found');
  let dayIndex = dayIndexFor(cls.start_date, date);
  // F2: an intervention class in a running study uses school-day numbering (weekends and holidays do not consume words)
  const sd = await classStudyDay(db, classId, date);
  const studyDayNo = sd && sd.group === 'intervention' ? sd.dayNo : null;
  if (studyDayNo !== null && sd) dayIndex = studyDayNo;

  const overrides = await db.all<{ word_id: string }>(
    'SELECT word_id FROM daily_word_overrides WHERE class_id = ? AND date = ? ORDER BY position',
    [classId, date],
  );
  if (overrides.length === 5) {
    return { classId, date, dayIndex, source: 'teacher', words: await getWordsByIds(db, overrides.map((o) => o.word_id)) };
  }

  if (sd && studyDayNo !== null) {
    const ids = await planWordIds(db, sd.studyId, studyDayNo);
    if (ids) return { classId, date, dayIndex, source: 'auto', words: await getWordsByIds(db, ids) };
  }

  const words: Word[] = [];
  const seen = new Set<string>();
  // dayIndex, then lower days down to 1, then wrap from 366 down to dayIndex + 1
  const order: number[] = [];
  for (let d = dayIndex; d >= 1; d--) order.push(d);
  for (let d = 366; d > dayIndex; d--) order.push(d);
  for (const d of order) {
    for (const r of await db.all("SELECT * FROM words WHERE source = 'bank' AND day_index = ? ORDER BY id", [d])) {
      if (words.length >= 5) break;
      if (!seen.has(r.id as string)) {
        seen.add(r.id as string);
        words.push(rowToWord(r));
      }
    }
    if (words.length >= 5) break;
  }
  if (words.length < 5) throw new HttpError(404, 'not_found', 'The word bank has no words loaded yet');
  return { classId, date, dayIndex, source: 'auto', words };
}
