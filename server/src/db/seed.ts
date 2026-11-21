/**
 * Seeding. OWNER: Lane A (server).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { academicYearFor } from '@shabd/core';
import { avatarFor, hashPassword } from '../auth.ts';
import { today } from '../clock.ts';
import type { DB, Queryable } from './db.ts';

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

const COLS = 14;
const CHUNK = 200;

/** Multi-row upsert in chunks of 200 (14 params/row stays far below PG's 65535 limit). Ids are de-duplicated (last wins). */
async function upsert(q: Queryable, entries: Record<string, unknown>[]): Promise<number> {
  const arr = (v: unknown) => JSON.stringify(isStrArr(v) ? v : []);
  const byId = new Map<string, Record<string, unknown>>();
  for (const e of entries) byId.set(e.id as string, e);
  const rows = [...byId.values()];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    for (const e of chunk) {
      params.push(
        e.id, e.dayIndex, e.word, e.partOfSpeech, e.difficulty, e.meaning,
        typeof e.meaningMarathi === 'string' ? e.meaningMarathi : '', e.exampleSentence,
        arr(e.distractorMeanings), arr(e.syllables), arr(e.tags), arr(e.contextWords), arr(e.forms), 'bank',
      );
    }
    const values = chunk.map(() => `(${Array(COLS).fill('?').join(', ')})`).join(', ');
    await q.run(
      `INSERT INTO words (id, day_index, word, part_of_speech, difficulty, meaning, meaning_marathi, example_sentence,
         distractors_json, syllables_json, tags_json, context_words_json, forms_json, source)
       VALUES ${values}
       ON CONFLICT (id) DO UPDATE SET day_index = EXCLUDED.day_index, word = EXCLUDED.word, part_of_speech = EXCLUDED.part_of_speech,
         difficulty = EXCLUDED.difficulty, meaning = EXCLUDED.meaning, meaning_marathi = EXCLUDED.meaning_marathi,
         example_sentence = EXCLUDED.example_sentence, distractors_json = EXCLUDED.distractors_json,
         syllables_json = EXCLUDED.syllables_json, tags_json = EXCLUDED.tags_json,
         context_words_json = EXCLUDED.context_words_json, forms_json = EXCLUDED.forms_json`,
      params,
    );
  }
  return rows.length;
}

/**
 * Upsert every entry of content/words/part-*.json into `words` (source='bank') in ONE transaction.
 * Idempotent (ON CONFLICT (id) DO UPDATE). Missing/unreadable files are skipped with a warning.
 * Only when the bank is still empty AND opts.allowFixture is set, server/test/fixtures/mini-bank.json is loaded instead.
 * Returns the number of words loaded.
 */
export async function loadWordBank(db: DB, contentDir: string, opts: { allowFixture?: boolean } = {}): Promise<number> {
  const batches: Record<string, unknown>[][] = [];
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
      batches.push(entries);
    } catch (e) {
      console.warn(`[seed] skipping ${f}: ${(e as Error).message}`);
    }
  }
  return db.tx(async (q) => {
    let loaded = 0;
    for (const entries of batches) loaded += await upsert(q, entries);
    const have = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM words WHERE source = 'bank'"))!.n;
    if (have === 0 && opts.allowFixture) {
      try {
        const entries = readEntries(MINI_BANK);
        console.warn(`[seed] word bank empty: loading ${entries.length} words from mini-bank fixture`);
        loaded += await upsert(q, entries);
      } catch (e) {
        console.warn(`[seed] could not load mini-bank fixture: ${(e as Error).message}`);
      }
    }
    return loaded;
  });
}

export const isProduction = (): boolean => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

/**
 * Demo seed when no teachers exist (idempotent):
 * school 'Demo School' (student_code 'DEMSCH'), school admin demo@school.test / demo1234, teacher invite 'TEACHERS'
 * (displayed TEAC-HERS, 365 days), class '5A' code 'DEMO5A' (standard 5, A, startDate = today IST),
 * 10 students roll 1-10 (Riya, Aarav, Kabir, Sai, Ananya, Om, Isha, Vedant, Gauri, Arjun), all with PIN '1234'.
 * Refuses (throws) in production (VERCEL_ENV/NODE_ENV = production) unless opts.force.
 * Returns true if data was created.
 */
export async function seedDemo(db: DB, opts: { force?: boolean } = {}): Promise<boolean> {
  if (isProduction() && !opts.force) {
    throw new Error('refusing to seed demo data in production (demo PIN 1234 would leak); pass --force to override');
  }
  return db.tx(async (q) => {
    if ((await q.get<{ n: number }>('SELECT COUNT(*) AS n FROM teachers'))!.n > 0) return false;
    const day = today();
    const sch = await q.run("INSERT INTO schools (name, district, student_code) VALUES ('Demo School', 'Demo', 'DEMSCH') ON CONFLICT (student_code) DO UPDATE SET name = EXCLUDED.name RETURNING id");
    const schoolId = sch.rows[0]!.id;
    const t = await q.run(
      "INSERT INTO teachers (name, email, password_hash, school_id, role) VALUES (?, ?, ?, ?, 'school_admin') RETURNING id",
      ['Demo Teacher', 'demo@school.test', hashPassword('demo1234'), schoolId],
    );
    await q.run(
      "INSERT INTO invites (code, kind, school_id, created_by_teacher_id, max_uses, expires_at) VALUES ('TEACHERS', 'teacher', ?, ?, NULL, ?)",
      [schoolId, t.rows[0]!.id, new Date(Date.now() + 365 * 86_400_000).toISOString()],
    );
    const c = await q.run(
      'INSERT INTO classes (teacher_id, school_id, name, class_code, start_date, standard, division, academic_year) VALUES (?, ?, ?, ?, ?, 5, ?, ?) RETURNING id',
      [t.rows[0]!.id, schoolId, '5A', 'DEMO5A', day, 'A', academicYearFor(day)],
    );
    const names = ['Riya', 'Aarav', 'Kabir', 'Sai', 'Ananya', 'Om', 'Isha', 'Vedant', 'Gauri', 'Arjun'];
    for (const [i, name] of names.entries()) {
      await q.run('INSERT INTO students (class_id, roll_no, first_name, avatar, pin) VALUES (?, ?, ?, ?, ?)', [c.rows[0]!.id, i + 1, name, avatarFor(i + 1), '1234']);
    }
    const base = (process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    console.log('[seed] demo data: school admin demo@school.test / demo1234, class DEMO5A, students PIN 1234');
    console.log(`[seed] links: ${base}/j/DEMO5A  ${base}/s/DEMSCH  ${base}/t/TEACHERS`);
    return true;
  });
}
