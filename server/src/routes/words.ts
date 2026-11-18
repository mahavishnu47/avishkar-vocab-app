/**
 * Word bank + daily words (teacher). OWNER: Lane A. Contract: docs/API.md section 4.
 */
import { Router } from 'express';
import type { CreateWordReq, DailySet, SetDailyWordsReq, Word, WordSearchRes } from '@shabd/core';
import { assertTeacherOwnsClass, requireTeacher } from '../auth.ts';
import { today } from '../clock.ts';
import { getDb } from '../db/db.ts';
import { badRequest, type H } from '../http.ts';
import { getDailySet, rowToWord } from '../services/dailySet.ts';
import { asObject, idParam, optDate, reqDate, reqString, stringArray } from '../validate.ts';

export const wordsRouter = Router();
wordsRouter.use(['/words', '/classes/:classId/daily-words'], requireTeacher);

type WordQuery = { q?: string; difficulty?: string; partOfSpeech?: string; tag?: string; dayIndex?: string; limit?: string; offset?: string };

const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection'];
const teacherId = (req: { auth?: { role: string; teacherId?: number } }) => req.auth!.teacherId!;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function intQuery(v: string | undefined, name: string, min: number, max: number): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

const searchWords: H<{}, WordSearchRes, unknown, WordQuery> = async (req, res) => {
  const q = (req.query.q ?? '').trim().toLowerCase();
  const difficulty = intQuery(req.query.difficulty, 'difficulty', 1, 3);
  const dayIndex = intQuery(req.query.dayIndex, 'dayIndex', 1, 366);
  const limit = intQuery(req.query.limit, 'limit', 1, 200) ?? 50;
  const offset = intQuery(req.query.offset, 'offset', 0, 1_000_000) ?? 0;
  const pos = req.query.partOfSpeech;
  if (pos !== undefined && pos !== '' && !POS.includes(pos)) throw badRequest('partOfSpeech is not valid');

  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q) {
    where.push("(word ILIKE ? ESCAPE '\\' OR meaning ILIKE ? ESCAPE '\\')");
    args.push(`%${likeEscape(q)}%`, `%${likeEscape(q)}%`);
  }
  if (difficulty !== undefined) { where.push('difficulty = ?'); args.push(difficulty); }
  if (pos) { where.push('part_of_speech = ?'); args.push(pos); }
  if (req.query.tag) { where.push("tags_json ILIKE ? ESCAPE '\\'"); args.push(`%"${likeEscape(req.query.tag)}"%`); }
  if (dayIndex !== undefined) { where.push('day_index = ?'); args.push(dayIndex); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const db = getDb();
  const total = Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM words ${w}`, args))!.n);
  const orderArgs: (string | number)[] = q ? [q, `${likeEscape(q)}%`] : [];
  const order = q
    ? "ORDER BY (word = ?) DESC, (word ILIKE ? ESCAPE '\\') DESC, day_index IS NULL, day_index, id"
    : 'ORDER BY day_index IS NULL, day_index, id';
  const rows = await db.all(`SELECT * FROM words ${w} ${order} LIMIT ? OFFSET ?`, [...args, ...orderArgs, limit, offset]);
  res.json({ total, items: rows.map(rowToWord) });
};

const createWord: H<{}, Word, CreateWordReq> = async (req, res) => {
  const b = asObject(req.body);
  const word = reqString(b, 'word', 3, 14).toLowerCase();
  if (!/^[a-z]{3,14}$/.test(word)) throw badRequest('word must be 3-14 letters a-z');
  const partOfSpeech = reqString(b, 'partOfSpeech', 1, 20);
  if (!POS.includes(partOfSpeech)) throw badRequest(`partOfSpeech must be one of ${POS.join(', ')}`);
  const difficulty = b.difficulty;
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) throw badRequest('difficulty must be 1, 2 or 3');
  const meaning = reqString(b, 'meaning', 2, 200);
  if (wordCount(meaning) < 2 || wordCount(meaning) > 12) throw badRequest('meaning must be 2-12 words');
  if (new RegExp(`\\b${word}\\b`, 'i').test(meaning)) throw badRequest('meaning must not contain the word itself');
  const exampleSentence = reqString(b, 'exampleSentence', 5, 200);
  if (!exampleSentence.toLowerCase().includes(word)) throw badRequest('exampleSentence must contain the word');
  const distractors = stringArray(b.distractorMeanings, 'distractorMeanings', 2, 2);
  if (distractors[0]!.toLowerCase() === distractors[1]!.toLowerCase()) throw badRequest('distractorMeanings must be 2 distinct meanings');
  for (const d of distractors) {
    if (wordCount(d) < 2 || wordCount(d) > 12) throw badRequest('each distractor must be 2-12 words');
    if (d.toLowerCase() === meaning.toLowerCase()) throw badRequest('a distractor must differ from the meaning');
  }
  const contextWords = stringArray(b.contextWords, 'contextWords', 3, 6, 30).map((s) => s.toLowerCase());
  const meaningMarathi = b.meaningMarathi === undefined ? '' : reqString({ v: b.meaningMarathi }, 'v', 0, 100).trim();
  const syllables = b.syllables === undefined ? [] : stringArray(b.syllables, 'syllables', 0, 10, 14);
  if (syllables.length && syllables.join('') !== word) throw badRequest('syllables must join back to the word');
  const tags = b.tags === undefined ? [] : stringArray(b.tags, 'tags', 0, 5, 40);
  const forms = b.forms === undefined ? [] : stringArray(b.forms, 'forms', 0, 10, 20);

  const db = getDb();
  // Ids come from a sequence, so concurrent creates cannot collide (no MAX()+1 race).
  const ins = await db.run(
    `INSERT INTO words (id, day_index, word, part_of_speech, difficulty, meaning, meaning_marathi, example_sentence,
       distractors_json, syllables_json, tags_json, context_words_json, forms_json, source, created_by)
     VALUES ('c-' || nextval('teacher_word_seq'), NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'teacher', ?) RETURNING *`,
    [word, partOfSpeech, difficulty, meaning, meaningMarathi, exampleSentence, JSON.stringify(distractors),
      JSON.stringify(syllables), JSON.stringify(tags), JSON.stringify(contextWords), JSON.stringify(forms), teacherId(req)],
  );
  res.status(201).json(rowToWord(ins.rows[0]!));
};

const getDaily: H<{ classId: string }, DailySet, unknown, { date?: string }> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass(teacherId(req), classId);
  const date = optDate(req.query.date, 'date') ?? today();
  res.json(await getDailySet(getDb(), classId, date));
};

const putDaily: H<{ classId: string; date: string }, DailySet, SetDailyWordsReq> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass(teacherId(req), classId);
  const date = reqDate(req.params.date, 'date');
  const b = asObject(req.body);
  const ids = b.wordIds;
  if (!Array.isArray(ids) || ids.length !== 5 || ids.some((i) => typeof i !== 'string') || new Set(ids).size !== 5) {
    throw badRequest('wordIds must be exactly 5 distinct word ids');
  }
  const db = getDb();
  for (const id of ids as string[]) if (!(await db.get('SELECT 1 FROM words WHERE id = ?', [id]))) throw badRequest(`wordIds: unknown word ${id}`);
  await db.tx(async (q) => {
    await q.run('DELETE FROM daily_word_overrides WHERE class_id = ? AND date = ?', [classId, date]);
    let i = 0;
    for (const id of ids as string[]) {
      i++;
      await q.run('INSERT INTO daily_word_overrides (class_id, date, position, word_id) VALUES (?, ?, ?, ?)', [classId, date, i, id]);
    }
  });
  res.json(await getDailySet(db, classId, date));
};

const deleteDaily: H<{ classId: string; date: string }, DailySet> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertTeacherOwnsClass(teacherId(req), classId);
  const date = reqDate(req.params.date, 'date');
  const db = getDb();
  await db.run('DELETE FROM daily_word_overrides WHERE class_id = ? AND date = ?', [classId, date]);
  res.json(await getDailySet(db, classId, date));
};

wordsRouter.get('/words', searchWords);
wordsRouter.post('/words', createWord);
wordsRouter.get('/classes/:classId/daily-words', getDaily);
wordsRouter.put('/classes/:classId/daily-words/:date', putDaily);
wordsRouter.delete('/classes/:classId/daily-words/:date', deleteDaily);
