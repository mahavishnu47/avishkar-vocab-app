/**
 * F6 recall service: picks the words to revise, builds answer-free items, derives correctness server-side and builds
 * the child's vocabulary bank. No XP is touched here (recall must not distort the research marks).
 */
import type { BankWord, RecallItem, RecallKind, RecallResult, RecallTodayRes } from '@shabd/core';
import { ASSESSMENT_POS_OPTIONS, RECALL_SET_SIZE } from '@shabd/core';
import type { Queryable, Row } from '../../db/db.ts';
import { badRequest } from '../../http.ts';
import { registerResearchTable } from './study.ts';

registerResearchTable('recall_attempts');

interface WordRow { id: string; word: string; part_of_speech: string; meaning: string; example_sentence: string; distractors_json: string }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(arr: T[], seed: string): T[] {
  const r = rng(hash(seed)); const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Word ids to revise on `date`: the latest completed session before it, then earlier words with a wrong attempt. */
export async function recallWordIds(q: Queryable, studentId: number, date: string): Promise<string[]> {
  const last = await q.get<{ id: number }>(
    'SELECT id FROM sessions WHERE student_id = ? AND date < ? AND completed_at IS NOT NULL ORDER BY date DESC LIMIT 1', [studentId, date]);
  if (!last) return [];
  const prev = (await q.all<{ word_id: string }>('SELECT word_id FROM word_scores WHERE session_id = ? ORDER BY position', [last.id])).map((r) => r.word_id);
  const ids = shuffle(prev, `${studentId}|${date}|prev`).slice(0, RECALL_SET_SIZE);
  if (ids.length < RECALL_SET_SIZE) {
    const wrong = await q.all<{ word_id: string }>(
      `SELECT ws.word_id FROM word_scores ws JOIN sessions s ON s.id = ws.session_id
        WHERE ws.student_id = ? AND s.date < ? AND ws.session_id <> ?
          AND EXISTS (SELECT 1 FROM word_attempts a WHERE a.student_id = ws.student_id AND a.word_id = ws.word_id AND a.is_correct = 0)
        GROUP BY ws.word_id ORDER BY ws.word_id`, [studentId, date, last.id]);
    for (const w of shuffle(wrong.map((r) => r.word_id), `${studentId}|${date}|old`)) {
      if (ids.length >= RECALL_SET_SIZE) break;
      if (!ids.includes(w)) ids.push(w);
    }
  }
  return ids;
}

const kindAt = (i: number): RecallKind => (i % 2 === 0 ? 'meaning' : 'pos');

async function loadWords(q: Queryable, ids: string[]): Promise<Map<string, WordRow>> {
  if (ids.length === 0) return new Map();
  const rows = await q.all<WordRow>('SELECT id, word, part_of_speech, meaning, example_sentence, distractors_json FROM words WHERE id = ANY(?::text[])', [ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

function buildItem(w: WordRow, kind: RecallKind, studentId: number, date: string): RecallItem {
  const seed = `${studentId}|${date}|${w.id}|${kind}`;
  if (kind === 'meaning') {
    const d = JSON.parse(w.distractors_json) as string[];
    return { itemId: `${w.id}:meaning`, wordId: w.id, kind, word: w.word, prompt: `What does "${w.word}" mean?`, options: shuffle([w.meaning, ...d.slice(0, 2)], seed) };
  }
  return { itemId: `${w.id}:pos`, wordId: w.id, kind, word: w.word, prompt: `Is "${w.word}" a noun, verb, adjective or adverb?`, options: [...ASSESSMENT_POS_OPTIONS] };
}

export async function recallToday(q: Queryable, studentId: number, date: string): Promise<RecallTodayRes> {
  const ids = await recallWordIds(q, studentId, date);
  const words = await loadWords(q, ids);
  const items = ids.flatMap((id, i) => { const w = words.get(id); return w ? [buildItem(w, kindAt(i), studentId, date)] : []; });
  const done = await q.get('SELECT 1 AS x FROM recall_attempts WHERE student_id = ? AND date = ? AND counted = 1 LIMIT 1', [studentId, date]);
  return { date, items, alreadyDone: !!done };
}

export interface AnswerIn { clientId: string; itemId: string; chosen: string; msElapsed: number; clientTs: string }

/** Re-derives correctness; idempotent on clientId; only the first answer per (date, word, kind) counts. */
export async function recordAnswers(q: Queryable, studentId: number, date: string, answers: AnswerIn[]): Promise<RecallResult[]> {
  const ids = await recallWordIds(q, studentId, date);
  const words = await loadWords(q, ids);
  const results: RecallResult[] = [];
  for (const a of answers) {
    const m = /^(.+):(meaning|pos)$/.exec(a.itemId);
    const w = m ? words.get(m[1]!) : undefined;
    if (!m || !w || !ids.includes(w.id)) throw badRequest('Unknown recall item');
    const kind = m[2] as RecallKind;
    const correct = kind === 'meaning' ? w.meaning : w.part_of_speech;
    const item = buildItem(w, kind, studentId, date);
    if (!item.options.includes(a.chosen)) throw badRequest('chosen is not one of the options');
    const prior = await q.get<Row>('SELECT * FROM recall_attempts WHERE client_id = ?', [a.clientId]);
    if (prior) {
      if (prior.student_id !== studentId) throw badRequest('clientId in use');
      results.push({ itemId: a.itemId, isCorrect: prior.is_correct === 1, correctAnswer: correct, counted: prior.counted === 1 });
      continue;
    }
    const isCorrect = a.chosen === correct;
    const ins = await q.run(
      `INSERT INTO recall_attempts (client_id, student_id, date, word_id, kind, chosen, is_correct, counted, ms_elapsed, client_ts)
       SELECT ?, ?, ?, ?, ?, ?, ?, CASE WHEN EXISTS (SELECT 1 FROM recall_attempts WHERE student_id = ? AND date = ? AND word_id = ? AND kind = ?) THEN 0 ELSE 1 END, ?, ?
       ON CONFLICT (client_id) DO NOTHING RETURNING counted`,
      [a.clientId, studentId, date, w.id, kind, a.chosen, isCorrect ? 1 : 0, studentId, date, w.id, kind, a.msElapsed, a.clientTs]);
    const counted = ins.rows[0] ? (ins.rows[0].counted as number) === 1 : false;
    results.push({ itemId: a.itemId, isCorrect, correctAnswer: correct, counted });
  }
  return results;
}

/** Every word the child has a word_scores row for, with only their own sentences. */
export async function bankFor(q: Queryable, studentId: number): Promise<BankWord[]> {
  const rows = await q.all<Row>(
    `SELECT w.id, w.word, w.part_of_speech, w.meaning, w.example_sentence,
            max(ws.stars) AS stars,
            (SELECT ss.text FROM sentence_submissions ss WHERE ss.student_id = ws.student_id AND ss.word_id = w.id AND ss.counted = 1
              ORDER BY ss.final_marks DESC NULLS LAST, ss.id DESC LIMIT 1) AS best_sentence,
            (SELECT round(100.0 * sum(ra.is_correct) / count(*)) FROM recall_attempts ra
              WHERE ra.student_id = ws.student_id AND ra.word_id = w.id AND ra.counted = 1) AS recall_pct,
            min(s.date) AS first_date
       FROM word_scores ws JOIN words w ON w.id = ws.word_id JOIN sessions s ON s.id = ws.session_id
      WHERE ws.student_id = ?
      GROUP BY w.id, w.word, w.part_of_speech, w.meaning, w.example_sentence, ws.student_id
      ORDER BY first_date DESC, w.word`, [studentId]);
  return rows.map((r) => ({
    wordId: r.id as string, word: r.word as string, partOfSpeech: r.part_of_speech as string, meaning: r.meaning as string,
    exampleSentence: r.example_sentence as string, bestSentence: (r.best_sentence as string | null) ?? null,
    stars: Number(r.stars), recallPct: r.recall_pct === null ? null : Number(r.recall_pct),
  }));
}
