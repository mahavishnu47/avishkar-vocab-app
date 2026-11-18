/**
 * Student flow. OWNER: Lane A. Contract: docs/API.md section 7.
 */
import { Router } from 'express';
import {
  SCORING, SCORING_VERSION, classifySpellingError, dayIndexFor, displayStreak, evaluateSentenceRules, levelFor, moderateSentence,
  scoreSentenceSubmission, weekStart,
  type AttemptsReq, type AttemptsRes, type CompleteWordRes, type DayStatus, type LeaderboardRes, type SentenceEvaluation, type SentenceReq,
  type SentenceRes, type SessionSummaryRes, type SpellingClassification, type SpellingHint, type StudentHomeRes, type TodaySessionRes, type Word,
} from '@shabd/core';
import { requireStudent } from '../auth.ts';
import { today } from '../clock.ts';
import { getDb, type DB } from '../db/db.ts';
import { HttpError, badRequest, notFound, type H } from '../http.ts';
import { classOf, studentOf } from '../mappers.ts';
import { leaderboard } from '../services/analytics.ts';
import { getDailySet, getWordsByIds } from '../services/dailySet.ts';
import { evaluateSentence } from '../services/sentenceEvaluator.ts';
import { completeSession, completeWord, getStreak, sessionWordIds, storedWordScores, xpTotal } from '../services/scoringService.ts';
import { asObject, idParam, reqBool, reqInt, reqIsoTs, reqString } from '../validate.ts';

export const studentRouter = Router();
studentRouter.use('/student', requireStudent);

type Row = Record<string, unknown>;
const HINTS: SpellingHint[] = ['first_letter', 'letter_tiles'];
const sid = (req: { auth?: { role: string; studentId?: number } }) => req.auth!.studentId!;

/** Load a session owned by the student (404 otherwise). */
function ownSession(db: DB, sessionId: number, studentId: number): Row {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND student_id = ?').get(sessionId, studentId) as Row | undefined;
  if (!s) throw notFound('Session not found');
  return s;
}

function wordInSession(db: DB, session: Row, wordId: string): Word {
  if (!sessionWordIds(session).includes(wordId)) throw badRequest('That word is not part of this session');
  return getWordsByIds(db, [wordId])[0]!;
}

const home: H<{}, StudentHomeRes> = (req, res) => {
  const db = getDb();
  const studentId = sid(req);
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as Row;
  const cls = classOf(db.prepare('SELECT * FROM classes WHERE id = ?').get(st.class_id) as Row);
  const date = today();
  const session = db.prepare('SELECT * FROM sessions WHERE student_id = ? AND date = ?').get(studentId, date) as Row | undefined;
  let status: DayStatus = 'not_started';
  let wordsDone = 0;
  if (session) {
    status = session.completed_at ? 'completed' : 'in_progress';
    wordsDone = (db.prepare('SELECT COUNT(*) AS n FROM word_scores WHERE session_id = ?').get(session.id) as { n: number }).n;
  }
  const streak = getStreak(db, studentId);
  const total = xpTotal(db, studentId);
  const xpWeek = (db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM xp_ledger WHERE student_id = ? AND week_start = ?').get(studentId, weekStart(date)) as { n: number }).n;
  res.json({
    student: studentOf(st),
    className: cls.name,
    leaderboardMode: cls.leaderboardMode,
    today: { date, dayIndex: dayIndexFor(cls.startDate, date), status, wordsDone, sessionId: session ? (session.id as number) : null },
    streak: displayStreak(streak, date),
    bestStreak: streak.best,
    xpTotal: total,
    xpWeek,
    level: levelFor(total),
  });
};

const startToday: H<{}, TodaySessionRes> = (req, res) => {
  const db = getDb();
  const studentId = sid(req);
  const classId = (req.auth as { classId: number }).classId;
  const date = today();
  let session = db.prepare('SELECT * FROM sessions WHERE student_id = ? AND date = ?').get(studentId, date) as Row | undefined;
  if (!session) {
    const set = getDailySet(db, classId, date);
    db.prepare(
      `INSERT OR IGNORE INTO sessions (student_id, class_id, date, day_index, word_ids_json, scoring_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(studentId, classId, date, set.dayIndex, JSON.stringify(set.words.map((w) => w.id)), SCORING_VERSION);
    session = db.prepare('SELECT * FROM sessions WHERE student_id = ? AND date = ?').get(studentId, date) as Row;
  }
  const ids = sessionWordIds(session);
  const wordScores = storedWordScores(db, session.id as number);
  res.json({
    session: {
      id: session.id as number,
      date: session.date as string,
      dayIndex: session.day_index as number,
      startedAt: session.started_at as string,
      completedAt: (session.completed_at as string | null) ?? null,
    },
    words: getWordsByIds(db, ids),
    progress: { completedWordIds: ids.filter((i) => wordScores.some((s) => s.wordId === i)), wordScores },
  });
};

function classificationFromRow(r: Row): SpellingClassification {
  return {
    isCorrect: r.is_correct === 1,
    tags: JSON.parse(r.error_tags_json as string),
    primary: r.primary_error as SpellingClassification['primary'],
    editDistance: (r.edit_distance as number) ?? 0,
  };
}

const attempts: H<{ sessionId: string }, AttemptsRes, AttemptsReq> = (req, res) => {
  const db = getDb();
  const session = ownSession(db, idParam(req.params.sessionId), sid(req));
  const sessionId = session.id as number;
  const studentId = sid(req);
  const b = asObject(req.body);
  const spell = b.spell === undefined ? [] : b.spell;
  const meaning = b.meaning === undefined ? [] : b.meaning;
  if (!Array.isArray(spell) || !Array.isArray(meaning)) throw badRequest('spell and meaning must be lists');
  if (spell.length + meaning.length > 200) throw badRequest('Too many attempts in one request');

  const accepted: string[] = [];
  const classifications: Record<string, SpellingClassification> = {};
  const findExisting = db.prepare('SELECT * FROM word_attempts WHERE client_id = ?');
  const insert = db.prepare(
    `INSERT INTO word_attempts (client_id, session_id, student_id, word_id, stage, attempt_no, input_text, is_correct, hints_json,
       error_tags_json, primary_error, edit_distance, audio_plays, ms_elapsed, client_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    spell.forEach((raw) => {
      const o = asObject(raw);
      const clientId = reqString(o, 'clientId', 1, 64);
      const wordId = reqString(o, 'wordId', 1, 20);
      const attemptNo = reqInt(o, 'attemptNo', 1, 3);
      if (typeof o.input !== 'string' || o.input.length > 100) throw badRequest('spell input must be text up to 100 characters');
      const hints = Array.isArray(o.hints) ? (o.hints.filter((h) => HINTS.includes(h as SpellingHint)) as SpellingHint[]) : [];
      const audioPlays = reqInt(o, 'audioPlays', 0, 10_000);
      const msElapsed = reqInt(o, 'msElapsed', 0, 86_400_000);
      const clientTs = reqIsoTs(o, 'clientTs');
      const word = wordInSession(db, session, wordId);
      const existing = findExisting.get(clientId) as Row | undefined;
      if (existing) {
        if (existing.session_id !== sessionId) throw new HttpError(409, 'conflict', 'clientId already used');
        accepted.push(clientId);
        classifications[clientId] = classificationFromRow(existing);
        return;
      }
      const cls = classifySpellingError(word.word, o.input);
      insert.run(clientId, sessionId, studentId, wordId, 'spell', attemptNo, o.input.trim(), cls.isCorrect ? 1 : 0, JSON.stringify(hints),
        JSON.stringify(cls.tags), cls.primary, cls.editDistance, audioPlays, msElapsed, clientTs);
      accepted.push(clientId);
      classifications[clientId] = cls;
    });

    meaning.forEach((raw) => {
      const o = asObject(raw);
      const clientId = reqString(o, 'clientId', 1, 64);
      const wordId = reqString(o, 'wordId', 1, 20);
      const attemptNo = reqInt(o, 'attemptNo', 1, 2);
      if (typeof o.chosen !== 'string') throw badRequest('chosen must be a string');
      const isCorrect = reqBool(o, 'isCorrect');
      const msElapsed = reqInt(o, 'msElapsed', 0, 86_400_000);
      const clientTs = reqIsoTs(o, 'clientTs');
      const word = wordInSession(db, session, wordId);
      const existing = findExisting.get(clientId) as Row | undefined;
      if (existing) {
        if (existing.session_id !== sessionId) throw new HttpError(409, 'conflict', 'clientId already used');
        accepted.push(clientId);
        return;
      }
      const options = [word.meaning, ...word.distractorMeanings];
      if (!options.includes(o.chosen)) throw badRequest('chosen is not one of the options for this word');
      const primary = attemptNo === 2 ? (isCorrect ? 'MN_WRONG_1' : 'MN_WRONG_2') : null;
      insert.run(clientId, sessionId, studentId, wordId, 'meaning', attemptNo, o.chosen, isCorrect ? 1 : 0, '[]', '[]', primary, null, 0, msElapsed, clientTs);
      accepted.push(clientId);
    });
  })();
  res.json({ accepted, classifications });
};

function evaluationFromRow(r: Row): SentenceEvaluation {
  return {
    gate: r.gate as SentenceEvaluation['gate'],
    rubric: { use: r.r_use as number, grammar: r.r_grammar as number, relevance: r.r_relevance as number, length: r.r_length as number },
    rawTotal: r.raw_total as number,
    errorCodes: JSON.parse(r.error_codes_json as string),
    confidence: r.confidence as number,
    feedback: JSON.parse(r.feedback_json as string),
    evaluator: r.evaluator as string,
    ...(r.tip ? { tip: r.tip as string } : {}),
  };
}

const sentence: H<{ sessionId: string }, SentenceRes, SentenceReq> = async (req, res) => {
  const db = getDb();
  const studentId = sid(req);
  const session = ownSession(db, idParam(req.params.sessionId), studentId);
  const sessionId = session.id as number;
  const b = asObject(req.body);
  const clientId = reqString(b, 'clientId', 1, 64);
  const wordId = reqString(b, 'wordId', 1, 20);
  const submissionNo = reqInt(b, 'submissionNo', 1, 2) as 1 | 2;
  if (typeof b.text !== 'string' || b.text.length > 500) throw badRequest('text must be a string up to 500 characters');
  const text = b.text;
  const starterHintUsed = b.starterHintUsed === undefined ? false : reqBool(b, 'starterHintUsed');
  const msElapsed = reqInt(b, 'msElapsed', 0, 86_400_000);
  const clientTs = reqIsoTs(b, 'clientTs');
  const word = wordInSession(db, session, wordId);

  const stored = (): SentenceRes | null => {
    const r = db.prepare('SELECT * FROM sentence_submissions WHERE client_id = ?').get(clientId) as Row | undefined;
    if (!r) return null;
    if (r.session_id !== sessionId) throw new HttpError(409, 'conflict', 'clientId already used');
    return { evaluation: evaluationFromRow(r), counted: r.counted === 1, finalMarks: (r.final_marks as number | null) ?? null };
  };
  const prior = stored();
  if (prior) { res.json(prior); return; }

  const evaluation = await evaluateSentence(text, word);
  const counted = evaluation.gate === 'ok';
  const countCounted = () =>
    (db.prepare('SELECT COUNT(*) AS n FROM sentence_submissions WHERE session_id = ? AND word_id = ? AND counted = 1').get(sessionId, wordId) as { n: number }).n;

  const result = ((): SentenceRes => {
    const done = stored(); // another request with the same clientId may have landed while we evaluated
    if (done) return done;
    const existingCounted = countCounted();
    if (counted && existingCounted >= SCORING.sentence.maxSubmissions) {
      throw new HttpError(409, 'conflict', 'You already have 2 scored sentences for this word');
    }
    const effectiveNo = (counted ? existingCounted + 1 : submissionNo) as 1 | 2;
    const finalMarks = counted ? scoreSentenceSubmission({ submissionNo: effectiveNo, rubric: evaluation.rubric, starterHintUsed }) : null;
    const rules = evaluation.evaluator.startsWith('rules') ? null : evaluateSentenceRules(text, word);
    const reason = evaluation.gate === 'blocked' ? (moderateSentence(text).reason ?? null) : null;
    db.prepare(
      `INSERT INTO sentence_submissions (client_id, session_id, student_id, word_id, submission_no, text, gate, counted,
         r_use, r_grammar, r_relevance, r_length, raw_total, multiplier, hint_cost, final_marks, error_codes_json, feedback_json,
         confidence, evaluator, tip, rules_json, moderation_reason, ms_elapsed, client_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(clientId, sessionId, studentId, wordId, effectiveNo, text, evaluation.gate, counted ? 1 : 0,
      evaluation.rubric.use, evaluation.rubric.grammar, evaluation.rubric.relevance, evaluation.rubric.length, evaluation.rawTotal,
      SCORING.sentence.submissionMultipliers[effectiveNo - 1], starterHintUsed ? SCORING.sentence.starterHintCost : 0, finalMarks,
      JSON.stringify(evaluation.errorCodes), JSON.stringify(evaluation.feedback), evaluation.confidence, evaluation.evaluator,
      evaluation.tip ?? null, rules ? JSON.stringify(rules) : null, reason, msElapsed, clientTs);
    return { evaluation, counted, finalMarks };
  })();
  res.json(result);
};

const completeWordRoute: H<{ sessionId: string; wordId: string }, CompleteWordRes> = (req, res) => {
  const db = getDb();
  const session = ownSession(db, idParam(req.params.sessionId), sid(req));
  res.json(completeWord(db, session.id as number, req.params.wordId));
};

const completeSessionRoute: H<{ sessionId: string }, SessionSummaryRes> = (req, res) => {
  const db = getDb();
  const session = ownSession(db, idParam(req.params.sessionId), sid(req));
  res.json(completeSession(db, session.id as number));
};

const studentLeaderboard: H<{}, LeaderboardRes> = (req, res) => {
  res.json(leaderboard(getDb(), (req.auth as { classId: number }).classId, 'week', today(), sid(req)));
};

studentRouter.get('/student/home', home);
studentRouter.post('/student/sessions/today', startToday);
studentRouter.post('/student/sessions/:sessionId/attempts', attempts);
studentRouter.post('/student/sessions/:sessionId/sentences', sentence);
studentRouter.post('/student/sessions/:sessionId/words/:wordId/complete', completeWordRoute);
studentRouter.post('/student/sessions/:sessionId/complete', completeSessionRoute);
studentRouter.get('/student/leaderboard', studentLeaderboard);
