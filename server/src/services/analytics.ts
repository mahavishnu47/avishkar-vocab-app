/**
 * Teacher analytics queries. OWNER: Lane A (server).
 * Weakness label rule (PRD US-T6 AC2, simplified): for each category, student rate = count / relevant events
 * (wrong spelling attempts for SP_*, scored+gated submissions for SN_*). Label when events >= 10 AND
 * rate >= 1.5 x class rate. At most 2 labels, highest ratio first. Label text: `Needs support: ${ERROR_LABELS[code]}`.
 */
import {
  EMPTY_STREAK, ERROR_LABELS, addDays, dayIndexFor, displayStreak, weekStart,
  type ClassAnalyticsRes, type ClassDashboardRes, type HardWord, type IsoDate, type LeaderboardEntry, type LeaderboardRes,
  type Rubric, type SentenceErrorCode, type SessionSummaryRes, type SpellingErrorCode, type StudentDayRow, type StudentDetailRes,
  type StudentErrorProfile,
} from '@shabd/core';
import type { Queryable } from '../db/db.ts';
import { notFound } from '../http.ts';
import { classOf, studentWithPinOf } from '../mappers.ts';
import { getDailySet } from './dailySet.ts';
import { completedSessionSummary, getStreak, xpTotal } from './scoringService.ts';

type Row = Record<string, unknown>;

const MIN_EVENTS = 10;
const RATIO = 1.5;
const MAX_LABELS = 2;
const NO_LABEL = new Set(['SP_CORRECT', 'SP_BLANK', 'SN_FLAGGED']);
const round1 = (n: number) => Math.round(n * 10) / 10;
const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const toRecord = <K extends string>(m: Map<string, number>) => Object.fromEntries([...m.entries()].sort()) as Partial<Record<K, number>>;

async function classRow(db: Queryable, classId: number): Promise<Row> {
  const r = await db.get('SELECT * FROM classes WHERE id = ?', [classId]);
  if (!r) throw notFound('Class not found');
  return r;
}

// ------------------------------------------------------------------ dashboard
export async function classDashboard(db: Queryable, classId: number, date: IsoDate): Promise<ClassDashboardRes> {
  const cls = classOf(await classRow(db, classId));
  const set = await getDailySet(db, classId, date);
  const wk = weekStart(date);
  const students = await db.all('SELECT * FROM students WHERE class_id = ? AND active = 1 ORDER BY roll_no', [classId]);
  const sessions = new Map((await db.all('SELECT * FROM sessions WHERE class_id = ? AND date = ?', [classId, date])).map((s) => [s.student_id as number, s]));

  // One GROUP BY query each instead of N+1 round trips per student.
  const doneRows = await db.all<{ session_id: number; n: number; t: number }>(
    `SELECT ws.session_id, COUNT(*) AS n, COALESCE(SUM(ws.total), 0) AS t
       FROM word_scores ws JOIN sessions s ON s.id = ws.session_id
      WHERE s.class_id = ? AND s.date = ? GROUP BY ws.session_id`,
    [classId, date],
  );
  const done = new Map(doneRows.map((r) => [Number(r.session_id), { n: Number(r.n), t: Number(r.t) }]));
  const xpRows = await db.all<{ student_id: number; n: number }>(
    `SELECT l.student_id, COALESCE(SUM(l.amount), 0) AS n FROM xp_ledger l JOIN students st ON st.id = l.student_id
      WHERE st.class_id = ? AND l.week_start = ? GROUP BY l.student_id`,
    [classId, wk],
  );
  const xpWeek = new Map(xpRows.map((r) => [Number(r.student_id), Number(r.n)]));
  const streakRows = await db.all<{ student_id: number; current: number; best: number; last_completed_date: string | null }>(
    'SELECT k.student_id, k.current, k.best, k.last_completed_date FROM streaks k JOIN students st ON st.id = k.student_id WHERE st.class_id = ?',
    [classId],
  );
  const streaks = new Map(streakRows.map((r) => [r.student_id, { current: r.current, best: r.best, lastCompletedDate: r.last_completed_date }]));

  const rows: StudentDayRow[] = students.map((st) => {
    const s = sessions.get(st.id as number);
    let status: StudentDayRow['status'] = 'not_started';
    let wordsDone = 0;
    let totalMarks: number | null = null;
    if (s) {
      const d = done.get(s.id as number) ?? { n: 0, t: 0 };
      wordsDone = d.n;
      status = s.completed_at ? 'completed' : 'in_progress';
      totalMarks = s.completed_at ? ((s.total_marks as number | null) ?? d.t) : d.t;
    }
    return {
      studentId: st.id as number, rollNo: st.roll_no as number, firstName: st.first_name as string, avatar: st.avatar as string,
      status, wordsDone, totalMarks, streak: displayStreak(streaks.get(st.id as number) ?? { ...EMPTY_STREAK }, date),
      xpWeek: xpWeek.get(st.id as number) ?? 0,
    };
  });
  return {
    date,
    dayIndex: dayIndexFor(cls.startDate, date),
    set,
    completedCount: rows.filter((r) => r.status === 'completed').length,
    students: rows,
  };
}

// ------------------------------------------------------------------ leaderboard
export async function leaderboard(db: Queryable, classId: number, period: 'week' | 'all', today: IsoDate, meStudentId?: number): Promise<LeaderboardRes> {
  const cls = classOf(await classRow(db, classId));
  const wk = weekStart(today);
  const base = { period, weekStart: wk, mode: cls.leaderboardMode };
  if (meStudentId !== undefined && cls.leaderboardMode === 'hidden') return { ...base, entries: [] };

  const students = await db.all('SELECT id, first_name, avatar FROM students WHERE class_id = ? AND active = 1', [classId]);
  const xpRows = await db.all<{ student_id: number; xp: number }>(
    period === 'week'
      ? 'SELECT student_id, SUM(amount) AS xp FROM xp_ledger WHERE week_start = ? GROUP BY student_id'
      : 'SELECT student_id, SUM(amount) AS xp FROM xp_ledger GROUP BY student_id',
    period === 'week' ? [wk] : [],
  );
  const xpBy = new Map(xpRows.map((r) => [Number(r.student_id), Number(r.xp)]));

  const sorted = students
    .map((s) => ({ studentId: s.id as number, firstName: s.first_name as string, avatar: s.avatar as string, xp: xpBy.get(s.id as number) ?? 0 }))
    .sort((a, b) => b.xp - a.xp || a.firstName.localeCompare(b.firstName) || a.studentId - b.studentId);
  const entries: LeaderboardEntry[] = [];
  sorted.forEach((s, i) => {
    const rank = i > 0 && sorted[i - 1]!.xp === s.xp ? entries[i - 1]!.rank : i + 1;
    entries.push({ rank, ...s, ...(meStudentId === s.studentId ? { isMe: true } : {}) });
  });
  if (meStudentId === undefined) return { ...base, entries };
  const me = entries.find((e) => e.studentId === meStudentId);
  return { ...base, entries: entries.slice(0, 10), ...(me ? { me } : {}) };
}

// ------------------------------------------------------------------ analytics
interface ClassProfiles {
  students: StudentErrorProfile[];
  spellingRates: Partial<Record<SpellingErrorCode, number>>;
  sentenceRates: Partial<Record<SentenceErrorCode, number>>;
  hardestWords: HardWord[];
}

interface Acc {
  row: Row;
  sessions: number;
  spellWords: Set<string>;
  spellWrong: Map<string, number>;
  spellWrongTotal: number;
  firstTry: number;
  scoredWords: number;
  sentCodes: Map<string, number>;
  sentTotal: number;
  best: Map<string, { marks: number; raw: number; rubric: Rubric }>;
}

async function buildProfiles(db: Queryable, classId: number, from: IsoDate, to: IsoDate, onlyActive: boolean): Promise<ClassProfiles> {
  const stRows = await db.all(`SELECT * FROM students WHERE class_id = ? ${onlyActive ? 'AND active = 1' : ''} ORDER BY roll_no`, [classId]);
  const acc = new Map<number, Acc>();
  for (const r of stRows) {
    acc.set(r.id as number, {
      row: r, sessions: 0, spellWords: new Set(), spellWrong: new Map(), spellWrongTotal: 0, firstTry: 0, scoredWords: 0,
      sentCodes: new Map(), sentTotal: 0, best: new Map(),
    });
  }

  for (const r of await db.all<{ student_id: number; n: number }>(
    'SELECT student_id, COUNT(*) AS n FROM sessions WHERE class_id = ? AND date BETWEEN ? AND ? AND completed_at IS NOT NULL GROUP BY student_id',
    [classId, from, to],
  )) {
    const a = acc.get(r.student_id);
    if (a) a.sessions = Number(r.n);
  }

  const spell = await db.all<{ student_id: number; word_id: string; attempt_no: number; is_correct: number; primary_error: string | null }>(
    `SELECT a.student_id, a.word_id, a.attempt_no, a.is_correct, a.primary_error
       FROM word_attempts a JOIN sessions s ON s.id = a.session_id
      WHERE s.class_id = ? AND s.date BETWEEN ? AND ? AND a.stage = 'spell'
      ORDER BY a.id`,
    [classId, from, to],
  );
  const classSpell = new Map<string, number>();
  let classSpellTotal = 0;
  const firstAttempts = new Map<string, Map<number, number>>(); // word -> student -> correct(0/1) at lowest attempt_no
  const firstNo = new Map<string, number>();
  for (const r of spell) {
    const a = acc.get(r.student_id);
    if (!a) continue;
    a.spellWords.add(r.word_id);
    if (r.is_correct === 0) {
      const code = r.primary_error ?? 'SP_FARMISS';
      inc(a.spellWrong, code);
      a.spellWrongTotal++;
      inc(classSpell, code);
      classSpellTotal++;
    }
    const key = `${r.word_id}|${r.student_id}`;
    if (!firstNo.has(key) || r.attempt_no < firstNo.get(key)!) {
      firstNo.set(key, r.attempt_no);
      let m = firstAttempts.get(r.word_id);
      if (!m) firstAttempts.set(r.word_id, (m = new Map()));
      m.set(r.student_id, r.is_correct);
    }
  }

  for (const r of await db.all<{ student_id: number; n: number; ft: number }>(
    `SELECT ws.student_id, COUNT(*) AS n, SUM(ws.spell_first_try) AS ft
       FROM word_scores ws JOIN sessions s ON s.id = ws.session_id
      WHERE s.class_id = ? AND s.date BETWEEN ? AND ? GROUP BY ws.student_id`,
    [classId, from, to],
  )) {
    const a = acc.get(r.student_id);
    if (a) { a.scoredWords = Number(r.n); a.firstTry = Number(r.ft); }
  }

  const sents = await db.all(
    `SELECT x.student_id, x.word_id, x.counted, x.final_marks, x.raw_total, x.r_use, x.r_grammar, x.r_relevance, x.r_length, x.error_codes_json
       FROM sentence_submissions x JOIN sessions s ON s.id = x.session_id
      WHERE s.class_id = ? AND s.date BETWEEN ? AND ? ORDER BY x.id`,
    [classId, from, to],
  );
  const classSent = new Map<string, number>();
  let classSentTotal = 0;
  for (const r of sents) {
    const a = acc.get(r.student_id as number);
    if (!a) continue;
    a.sentTotal++;
    classSentTotal++;
    for (const code of JSON.parse(r.error_codes_json as string) as string[]) {
      inc(a.sentCodes, code);
      inc(classSent, code);
    }
    if (r.counted === 1) {
      const marks = (r.final_marks as number | null) ?? 0;
      const cur = a.best.get(r.word_id as string);
      if (!cur || marks > cur.marks) {
        a.best.set(r.word_id as string, {
          marks, raw: r.raw_total as number,
          rubric: { use: r.r_use as number, grammar: r.r_grammar as number, relevance: r.r_relevance as number, length: r.r_length as number },
        });
      }
    }
  }

  const classRate = (m: Map<string, number>, total: number) => (total > 0 ? (c: string) => (m.get(c) ?? 0) / total : () => 0);
  const spellClassRate = classRate(classSpell, classSpellTotal);
  const sentClassRate = classRate(classSent, classSentTotal);

  const labelsFor = (a: Acc): string[] => {
    const cands: { code: string; ratio: number }[] = [];
    const consider = (counts: Map<string, number>, events: number, rateOf: (c: string) => number) => {
      if (events < MIN_EVENTS) return;
      for (const [code, n] of counts) {
        if (NO_LABEL.has(code)) continue;
        const cr = rateOf(code);
        const sr = n / events;
        if (cr > 0 && sr >= RATIO * cr) cands.push({ code, ratio: sr / cr });
      }
    };
    consider(a.spellWrong, a.spellWrongTotal, spellClassRate);
    consider(a.sentCodes, a.sentTotal, sentClassRate);
    return cands
      .sort((x, y) => y.ratio - x.ratio || x.code.localeCompare(y.code))
      .slice(0, MAX_LABELS)
      .map((c) => `Needs support: ${ERROR_LABELS[c.code as keyof typeof ERROR_LABELS]}`);
  };

  const students: StudentErrorProfile[] = [...acc.values()].map((a) => {
    const best = [...a.best.values()];
    const n = best.length;
    return {
      studentId: a.row.id as number,
      firstName: a.row.first_name as string,
      avatar: a.row.avatar as string,
      sessionsCompleted: a.sessions,
      spellingWords: a.spellWords.size,
      spellingStrength: a.scoredWords > 0 ? round1((a.firstTry / a.scoredWords) * 100) : null,
      sentenceStrength: n > 0 ? round1((best.reduce((s, b) => s + b.raw, 0) / n / 40) * 100) : null,
      spellingErrorCounts: toRecord<SpellingErrorCode>(a.spellWrong),
      sentenceErrorCounts: toRecord<SentenceErrorCode>(a.sentCodes),
      rubricAverages: n > 0
        ? {
            use: round1(best.reduce((s, b) => s + b.rubric.use, 0) / n),
            grammar: round1(best.reduce((s, b) => s + b.rubric.grammar, 0) / n),
            relevance: round1(best.reduce((s, b) => s + b.rubric.relevance, 0) / n),
            length: round1(best.reduce((s, b) => s + b.rubric.length, 0) / n),
          }
        : null,
      weaknessLabels: labelsFor(a),
    };
  });

  const rates = (m: Map<string, number>, total: number) =>
    Object.fromEntries([...m.entries()].sort().map(([k, v]) => [k, v / total]));
  const hardest: HardWord[] = [];
  for (const [wordId, byStudent] of firstAttempts) {
    if (byStudent.size < 3) continue;
    const correct = [...byStudent.values()].reduce((s, v) => s + v, 0);
    hardest.push({ wordId, word: '', attempts: byStudent.size, firstAttemptAccuracy: correct / byStudent.size });
  }
  hardest.sort((a, b) => a.firstAttemptAccuracy - b.firstAttemptAccuracy || b.attempts - a.attempts || a.wordId.localeCompare(b.wordId));
  const top = hardest.slice(0, 10);
  if (top.length) {
    const wordRows = await db.all<{ id: string; word: string }>('SELECT id, word FROM words WHERE id = ANY(?::text[])', [top.map((h) => h.wordId)]);
    const wordOf = new Map(wordRows.map((r) => [r.id, r.word]));
    for (const h of top) h.word = wordOf.get(h.wordId) ?? h.wordId;
  }

  return {
    students,
    spellingRates: rates(classSpell, classSpellTotal) as ClassProfiles['spellingRates'],
    sentenceRates: rates(classSent, classSentTotal) as ClassProfiles['sentenceRates'],
    hardestWords: top,
  };
}

export async function classAnalytics(db: Queryable, classId: number, from: IsoDate, to: IsoDate): Promise<ClassAnalyticsRes> {
  await classRow(db, classId);
  const p = await buildProfiles(db, classId, from, to, true);
  return { from, to, students: p.students, classSpellingRates: p.spellingRates, classSentenceRates: p.sentenceRates, hardestWords: p.hardestWords };
}

export function defaultWindow(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addDays(today, -27), to: today };
}

export async function studentDetail(db: Queryable, studentId: number): Promise<StudentDetailRes> {
  const st = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!st) throw notFound('Student not found');
  const profile = (await buildProfiles(db, st.class_id as number, '0000-01-01', '9999-12-31', false)).students.find((p) => p.studentId === studentId)!;

  const sessionRows = await db.all('SELECT * FROM sessions WHERE student_id = ? AND completed_at IS NOT NULL ORDER BY date DESC LIMIT 14', [studentId]);
  const sessions: SessionSummaryRes[] = [];
  for (const s of sessionRows) sessions.push(await completedSessionSummary(db, s));

  const spellingErrors = (await db.all(
    `SELECT s.date, w.word, a.input_text, a.attempt_no, a.primary_error, a.error_tags_json
       FROM word_attempts a JOIN sessions s ON s.id = a.session_id JOIN words w ON w.id = a.word_id
      WHERE a.student_id = ? AND a.stage = 'spell' AND a.is_correct = 0 ORDER BY a.id DESC LIMIT 30`,
    [studentId],
  )).map((r) => ({
    date: r.date as string, word: r.word as string, input: r.input_text as string, attemptNo: r.attempt_no as number,
    primary: (r.primary_error ?? 'SP_FARMISS') as SpellingErrorCode, tags: JSON.parse(r.error_tags_json as string) as SpellingErrorCode[],
  }));

  const sentences = (await db.all(
    `SELECT s.date, w.word, x.text, x.submission_no, x.r_use, x.r_grammar, x.r_relevance, x.r_length, x.final_marks,
            x.error_codes_json, x.evaluator, x.tip
       FROM sentence_submissions x JOIN sessions s ON s.id = x.session_id JOIN words w ON w.id = x.word_id
      WHERE x.student_id = ? ORDER BY x.id DESC LIMIT 30`,
    [studentId],
  )).map((r) => ({
    date: r.date as string, word: r.word as string, text: r.text as string, submissionNo: r.submission_no as number,
    rubric: { use: r.r_use as number, grammar: r.r_grammar as number, relevance: r.r_relevance as number, length: r.r_length as number },
    finalMarks: (r.final_marks as number | null) ?? null,
    errorCodes: JSON.parse(r.error_codes_json as string) as SentenceErrorCode[],
    evaluator: r.evaluator as string,
    ...(r.tip ? { tip: r.tip as string } : {}),
  }));

  return { student: studentWithPinOf(st), profile, sessions, spellingErrors, sentences };
}

// ------------------------------------------------------------------ CSV
type Cell = string | number | null | undefined;

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = v;
  // Spreadsheet formula injection: child-written text must never start a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const semi = (json: unknown) => (JSON.parse(String(json ?? '[]')) as string[]).join(';');
const topKey = (m: Partial<Record<string, number>>): string => {
  let best = '';
  let n = 0;
  for (const [k, v] of Object.entries(m)) if ((v ?? 0) > n) { best = k; n = v!; }
  return best;
};

/**
 * CSV export (UTF-8 with BOM, CRLF, RFC 4180 quoting). Columns in docs/API.md section 6.
 * type: 'attempts' | 'sentences' | 'daily' | 'students'
 */
export async function exportCsv(db: Queryable, classId: number, type: 'attempts' | 'sentences' | 'daily' | 'students'): Promise<string> {
  switch (type) {
    case 'attempts': {
      const rows = await db.all(
          `SELECT s.date, st.roll_no, st.first_name, w.word, a.stage, a.attempt_no, a.input_text, a.is_correct, a.primary_error,
                  a.error_tags_json, a.hints_json, a.audio_plays, a.ms_elapsed, a.client_ts
             FROM word_attempts a JOIN sessions s ON s.id = a.session_id JOIN students st ON st.id = a.student_id JOIN words w ON w.id = a.word_id
            WHERE s.class_id = ? ORDER BY s.date, st.roll_no, a.id`,
        [classId],
      );
      return toCsv(
        ['date', 'roll_no', 'first_name', 'word', 'stage', 'attempt_no', 'input_text', 'is_correct', 'primary_error', 'error_tags', 'hints', 'audio_plays', 'ms_elapsed', 'client_ts'],
        rows.map((r) => [r.date, r.roll_no, r.first_name, r.word, r.stage, r.attempt_no, r.input_text, r.is_correct, r.primary_error,
          semi(r.error_tags_json), semi(r.hints_json), r.audio_plays, r.ms_elapsed, r.client_ts] as Cell[]),
      );
    }
    case 'sentences': {
      const rows = await db.all(
          `SELECT s.date, st.roll_no, st.first_name, w.word, x.submission_no, x.text, x.gate, x.counted, x.r_use, x.r_grammar,
                  x.r_relevance, x.r_length, x.raw_total, x.final_marks, x.error_codes_json, x.evaluator, x.confidence, x.tip
             FROM sentence_submissions x JOIN sessions s ON s.id = x.session_id JOIN students st ON st.id = x.student_id JOIN words w ON w.id = x.word_id
            WHERE s.class_id = ? ORDER BY s.date, st.roll_no, x.id`,
        [classId],
      );
      return toCsv(
        ['date', 'roll_no', 'first_name', 'word', 'submission_no', 'text', 'gate', 'counted', 'r_use', 'r_grammar', 'r_relevance', 'r_length', 'raw_total', 'final_marks', 'error_codes', 'evaluator', 'confidence', 'tip'],
        rows.map((r) => [r.date, r.roll_no, r.first_name, r.word, r.submission_no, r.text, r.gate, r.counted, r.r_use, r.r_grammar,
          r.r_relevance, r.r_length, r.raw_total, r.final_marks, semi(r.error_codes_json), r.evaluator, r.confidence, r.tip] as Cell[]),
      );
    }
    case 'daily': {
      const rows = await db.all(
          `SELECT s.date, st.roll_no, st.first_name, ws.position, w.word, ws.spelling, ws.meaning, ws.sentence, ws.total, ws.stars, ws.spell_first_try
             FROM word_scores ws JOIN sessions s ON s.id = ws.session_id JOIN students st ON st.id = ws.student_id JOIN words w ON w.id = ws.word_id
            WHERE s.class_id = ? ORDER BY s.date, st.roll_no, ws.position`,
        [classId],
      );
      return toCsv(
        ['date', 'roll_no', 'first_name', 'word_position', 'word', 'spelling', 'meaning', 'sentence', 'total', 'stars', 'spell_first_try'],
        rows.map((r) => [r.date, r.roll_no, r.first_name, r.position, r.word, r.spelling, r.meaning, r.sentence, r.total, r.stars, r.spell_first_try] as Cell[]),
      );
    }
    case 'students': {
      const profiles = new Map((await buildProfiles(db, classId, '0000-01-01', '9999-12-31', false)).students.map((p) => [p.studentId, p]));
      const sts = await db.all('SELECT * FROM students WHERE class_id = ? ORDER BY roll_no', [classId]);
      const out: Cell[][] = [];
      for (const st of sts) {
        const p = profiles.get(st.id as number)!;
        const streak = await getStreak(db, st.id as number);
        out.push([st.roll_no, st.first_name, p.sessionsCompleted, await xpTotal(db, st.id as number), streak.current, streak.best,
          p.spellingStrength, p.sentenceStrength, topKey(p.spellingErrorCounts), topKey(p.sentenceErrorCounts), p.weaknessLabels.join(';')] as Cell[]);
      }
      return toCsv(
        ['roll_no', 'first_name', 'sessions_completed', 'xp_total', 'streak_current', 'streak_best', 'spelling_strength', 'sentence_strength', 'top_spelling_error', 'top_sentence_error', 'weakness_labels'],
        out,
      );
    }
  }
}
