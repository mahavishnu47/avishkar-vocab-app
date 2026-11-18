/**
 * Seeding. OWNER: Lane A (server).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { avatarFor, hashPassword } from '../auth.ts';
import { today } from '../clock.ts';
import type { DB } from './db.ts';

const MINI_BANK = resolve(import.meta.dirname, '../../test/fixtures/mini-bank.json');
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection']);

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isStrArr = (v: unknown, n?: number): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string') && (n === undefined || v.length === n);

/** Returns an error string, or null if the entry is usable. */
function checkEntry(e: Record<string, unknown>): string | null {
  if (!isStr(e.id) || !/^d\d{3}-[1-5]$/.test(e.id)) return 'bad id';
  if (!Number.isInteger(e.dayIndex) || (e.dayIndex as number) < 1 || (e.dayIndex as number) > 366) return 'bad dayIndex';
  if (!isStr(e.word) || !/^[a-z]{3,14}$/.test(e.word)) return 'bad word';
  if (!isStr(e.partOfSpeech) || !POS.has(e.partOfSpeech)) return 'bad partOfSpeech';
  if (![1, 2, 3].includes(e.difficulty as number)) return 'bad difficulty';
  if (!isStr(e.meaning) || !isStr(e.exampleSentence)) return 'bad meaning/exampleSentence';
  if (!isStrArr(e.distractorMeanings, 2)) return 'bad distractorMeanings';
  return null;
}

function readEntries(file: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('not a JSON array');
  const out: Record<string, unknown>[] = [];
  for (const e of parsed) {
    const err = e && typeof e === 'object' ? checkEntry(e as Record<string, unknown>) : 'not an object';
    if (err) console.warn(`[seed] ${file}: skipping entry ${(e as { id?: string })?.id ?? '?'}: ${err}`);
    else out.push(e as Record<string, unknown>);
  }
  return out;
}

function upsert(db: DB, entries: Record<string, unknown>[]): number {
  const stmt = db.prepare(
    `INSERT INTO words (id, day_index, word, part_of_speech, difficulty, meaning, meaning_marathi, example_sentence,
       distractors_json, syllables_json, tags_json, context_words_json, forms_json, source)
     VALUES (@id, @dayIndex, @word, @pos, @difficulty, @meaning, @marathi, @example, @distractors, @syllables, @tags, @context, @forms, 'bank')
     ON CONFLICT(id) DO UPDATE SET day_index = excluded.day_index, word = excluded.word, part_of_speech = excluded.part_of_speech,
       difficulty = excluded.difficulty, meaning = excluded.meaning, meaning_marathi = excluded.meaning_marathi,
       example_sentence = excluded.example_sentence, distractors_json = excluded.distractors_json,
       syllables_json = excluded.syllables_json, tags_json = excluded.tags_json,
       context_words_json = excluded.context_words_json, forms_json = excluded.forms_json`,
  );
  const arr = (v: unknown) => JSON.stringify(isStrArr(v) ? v : []);
  db.transaction(() => {
    for (const e of entries) {
      stmt.run({
        id: e.id, dayIndex: e.dayIndex, word: e.word, pos: e.partOfSpeech, difficulty: e.difficulty, meaning: e.meaning,
        marathi: typeof e.meaningMarathi === 'string' ? e.meaningMarathi : '', example: e.exampleSentence,
        distractors: arr(e.distractorMeanings), syllables: arr(e.syllables), tags: arr(e.tags),
        context: arr(e.contextWords), forms: arr(e.forms),
      });
    }
  })();
  return entries.length;
}

/**
 * Upsert every entry of content/words/part-*.json into `words` (source='bank').
 * Idempotent (INSERT ... ON CONFLICT(id) DO UPDATE). Missing/empty files are skipped with a warning,
 * so the server boots before content exists. Returns the number of words loaded.
 * If the bank is still empty afterwards, server/test/fixtures/mini-bank.json is loaded instead.
 */
export function loadWordBank(db: DB, contentDir: string): number {
  let loaded = 0;
  let files: string[] = [];
  try {
    files = existsSync(contentDir) ? readdirSync(contentDir).filter((f) => /^part-.*\.json$/.test(f) && !f.startsWith('_')).sort() : [];
  } catch (e) {
    console.warn(`[seed] cannot read ${contentDir}: ${(e as Error).message}`);
  }
  if (files.length === 0) console.warn(`[seed] no content/words/part-*.json files found in ${contentDir}`);
  for (const f of files) {
    try {
      const entries = readEntries(join(contentDir, f));
      if (entries.length === 0) console.warn(`[seed] ${f} has no usable entries`);
      loaded += upsert(db, entries);
    } catch (e) {
      console.warn(`[seed] skipping ${f}: ${(e as Error).message}`);
    }
  }
  const have = (db.prepare("SELECT COUNT(*) AS n FROM words WHERE source = 'bank'").get() as { n: number }).n;
  if (have === 0) {
    try {
      const entries = readEntries(MINI_BANK);
      console.warn(`[seed] word bank empty: loading ${entries.length} words from mini-bank fixture`);
      loaded += upsert(db, entries);
    } catch (e) {
      console.warn(`[seed] could not load mini-bank fixture: ${(e as Error).message}`);
    }
  }
  return loaded;
}

/**
 * Dev seed when SEED_DEMO=1 and no teachers exist:
 * teacher demo@school.test / demo1234, class '5A' code 'DEMO5A' (startDate = today IST),
 * 10 students roll 1-10 (Riya, Aarav, Kabir, Sai, Ananya, Om, Isha, Vedant, Gauri, Arjun), all with PIN '1234'.
 * Real classes get random PINs from generatePin().
 */
export function seedDemo(db: DB): void {
  if ((db.prepare('SELECT COUNT(*) AS n FROM teachers').get() as { n: number }).n > 0) return;
  db.transaction(() => {
    const t = db
      .prepare('INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?)')
      .run('Demo Teacher', 'demo@school.test', hashPassword('demo1234'));
    const c = db
      .prepare('INSERT INTO classes (teacher_id, name, class_code, start_date) VALUES (?, ?, ?, ?)')
      .run(Number(t.lastInsertRowid), '5A', 'DEMO5A', today());
    const ins = db.prepare('INSERT INTO students (class_id, roll_no, first_name, avatar, pin) VALUES (?, ?, ?, ?, ?)');
    ['Riya', 'Aarav', 'Kabir', 'Sai', 'Ananya', 'Om', 'Isha', 'Vedant', 'Gauri', 'Arjun'].forEach((name, i) => {
      ins.run(Number(c.lastInsertRowid), i + 1, name, avatarFor(i + 1), '1234');
    });
  })();
  console.log('[seed] demo data: teacher demo@school.test / demo1234, class DEMO5A, students PIN 1234');
}
