/**
 * GET /api/student/progress: a child's own history in kid terms (stars, percentages, friendly labels).
 * Reads only practice tables (sessions, word_scores, word_attempts, xp_ledger, streaks). Assessment/test marks of
 * the study module live in other tables and are never read here: tests are never shown to children.
 */
import { Router } from 'express';
import {
  PROGRESS_DAYS, PROGRESS_MAX_SESSIONS, PROGRESS_MAX_WEAK_WORDS, SCORING, WEAK_WORD_BELOW, addDays, levelFor, skillLabel,
  displayStreak,
  type ProgressDay, type ProgressSkill, type ProgressWeakWord, type SkillKey, type StudentProgressRes,
} from '@shabd/core';
import { requireStudent } from '../auth.ts';
import { today } from '../clock.ts';
import { getDb } from '../db/db.ts';
import type { H } from '../http.ts';
import { getStreak, xpTotal } from '../services/scoringService.ts';

export const studentProgressRouter = Router();

const pct = (num: number, den: number) => Math.max(0, Math.min(100, Math.round((num / den) * 100)));

const progress: H<{}, StudentProgressRes> = async (req, res) => {
  const db = getDb();
  const studentId = (req.auth as { studentId: number }).studentId;
  const date = today();

  const scores = await db.all<{ session_id: number; date: string; word_id: string; spelling: number; meaning: number; sentence: number; total: number; stars: number }>(
    `SELECT ws.session_id, s.date, ws.word_id, ws.spelling, ws.meaning, ws.sentence, ws.total, ws.stars
       FROM word_scores ws JOIN sessions s ON s.id = ws.session_id
      WHERE ws.student_id = ? AND s.student_id = ? ORDER BY s.date DESC, ws.position`,
    [studentId, studentId],
  );
  const sessions = await db.all<{ id: number; date: string; completed_at: string | null }>(
    'SELECT id, date, completed_at FROM sessions WHERE student_id = ? ORDER BY date DESC', [studentId],
  );

  // per-session roll-up
  const bySession = new Map<number, { n: number; stars: number; total: number }>();
  for (const r of scores) {
    const a = bySession.get(r.session_id) ?? { n: 0, stars: 0, total: 0 };
    a.n++; a.stars += r.stars; a.total += r.total;
    bySession.set(r.session_id, a);
  }
  const roll = (id: number) => bySession.get(id) ?? { n: 0, stars: 0, total: 0 };

  const dayMap = new Map(sessions.map((s) => [s.date, s]));
  const days: ProgressDay[] = [];
  for (let i = PROGRESS_DAYS - 1; i >= 0; i--) {
    const d = addDays(date, -i);
    const s = dayMap.get(d);
    const r = s ? roll(s.id) : null;
    const played = !!r && r.n > 0;
    days.push({
      date: d, played, wordsDone: r?.n ?? 0,
      stars: played ? r!.stars : null,
      percent: played ? pct(r!.total, SCORING.wordMax * r!.n) : null,
    });
  }

  // skills
  const skills: ProgressSkill[] = [];
  const add = (key: SkillKey, num: number, den: number) => {
    if (den <= 0) return;
    const percent = pct(num, den);
    skills.push({ key, percent, label: skillLabel(percent) });
  };
  const n = scores.length;
  add('spelling', scores.reduce((a, r) => a + r.spelling, 0), SCORING.spelling.max * n);
  add('meaning', scores.reduce((a, r) => a + r.meaning, 0), SCORING.meaning.max * n);
  // word type: share of part-of-speech words got right on the first tap
  const pos = await db.all<{ word_id: string; session_id: number; first_ok: number }>(
    `SELECT word_id, session_id, MAX(CASE WHEN attempt_no = 1 AND is_correct = 1 THEN 1 ELSE 0 END) AS first_ok
       FROM word_attempts WHERE student_id = ? AND stage = 'pos' GROUP BY word_id, session_id`,
    [studentId],
  );
  add('wordType', pos.reduce((a, r) => a + Number(r.first_ok), 0), pos.length);
  add('sentence', scores.reduce((a, r) => a + r.sentence, 0), SCORING.sentence.max * n);

  // words to practise: the latest score of each word is weak (newest first)
  const seen = new Set<string>();
  const weakIds: { wordId: string; stars: number }[] = [];
  for (const r of [...scores].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) {
    if (seen.has(r.word_id)) continue;
    seen.add(r.word_id);
    if (r.total < WEAK_WORD_BELOW) weakIds.push({ wordId: r.word_id, stars: r.stars });
  }
  const wordsToPractise: ProgressWeakWord[] = [];
  for (const w of weakIds.slice(0, PROGRESS_MAX_WEAK_WORDS)) {
    const row = await db.get<{ word: string }>('SELECT word FROM words WHERE id = ?', [w.wordId]);
    if (row) wordsToPractise.push({ wordId: w.wordId, word: row.word, stars: w.stars });
  }

  const streak = await getStreak(db, studentId);
  const xp = await xpTotal(db, studentId);
  const level = levelFor(xp);
  const recentSessions = sessions
    .filter((s) => roll(s.id).n > 0)
    .slice(0, PROGRESS_MAX_SESSIONS)
    .map((s) => ({ sessionId: s.id, date: s.date, wordsDone: roll(s.id).n, stars: roll(s.id).stars }));

  res.json({
    totals: {
      daysPlayed: sessions.filter((s) => s.completed_at).length,
      wordsLearned: seen.size,
      currentStreak: displayStreak(streak, date),
      bestStreak: streak.best,
      xp,
      level,
      levelPercent: pct(level.xpIntoLevel, Math.max(1, level.xpForNextLevel)),
      xpToNextLevel: Math.max(0, level.xpForNextLevel - level.xpIntoLevel),
    },
    days, skills, wordsToPractise, recentSessions,
  });
};

studentProgressRouter.get('/student/progress', requireStudent, progress);
