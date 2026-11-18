/**
 * In-browser mock of the student API, enabled with ?mock=1 (see StudentApp). DEV/QA only.
 * Patches the `api` object's student methods; state lives in localStorage so reloads behave like a server.
 * Honours navigator.onLine === false by throwing a network error (so DevTools/Playwright offline works).
 * Counts every stored write on window.__mock so tests can assert "no duplicates".
 */
import type {
  AttemptsReq, AttemptsRes, SentenceEvaluation, SentenceReq, SentenceRes, SessionSummaryRes, StudentHomeRes, TodaySessionRes,
  Word, WordScore, LeaderboardRes, FeedbackItem,
} from '@shabd/core';
import { api, ApiRequestError } from '../shared/api.ts';

const KEY = 'shabd.mock.db';
const DATE = '2026-11-18';
const W = (n: number, word: string, pos: Word['partOfSpeech'], meaning: string, ex: string, d: [string, string], syl: string[]): Word => ({
  id: `d${String(n).padStart(3, '0')}-${n}`, dayIndex: 1, source: 'bank', word, partOfSpeech: pos, difficulty: 2, meaning,
  exampleSentence: ex, distractorMeanings: d, syllables: syl, tags: ['school'], contextWords: ['day'],
});
const WORDS: Word[] = [
  W(1, 'whisper', 'verb', 'to speak very softly', 'The children whisper in the library.', ['to shout loudly', 'to run fast'], ['whis', 'per']),
  W(2, 'enormous', 'adjective', 'very, very big', 'An elephant is an enormous animal.', ['very small', 'very cold'], ['e', 'nor', 'mous']),
  W(3, 'knife', 'noun', 'a tool with a sharp edge for cutting', 'Mother cut the fruit with a knife.', ['a tool for writing', 'a bowl for water'], ['knife']),
  W(4, 'bravely', 'adverb', 'in a way that is not afraid', 'The boy bravely jumped into the river.', ['in a sleepy way', 'in a noisy way'], ['brave', 'ly']),
  W(5, 'island', 'noun', 'land with water all around it', 'We took a boat to the island.', ['a very tall hill', 'a big forest'], ['is', 'land']),
];
const STUDENTS = [
  { id: 1, firstName: 'Riya', avatar: '🦁' }, { id: 2, firstName: 'Aarav', avatar: '🐯' }, { id: 3, firstName: 'Sai', avatar: '🐼' },
  { id: 4, firstName: 'Meera', avatar: '🦊' },
];

interface Db {
  token?: string; sid: number; started: boolean; completed: string[]; scores: WordScore[]; done: boolean; xp: number; streak: number;
  seen: Record<string, 1>; counts: { spell: number; meaning: number; sentence: number }; subs: Record<string, number[]>;
  spellOk: Record<string, number | null>; meaningOk: Record<string, number | null>; best: Record<string, number>; summary?: SessionSummaryRes;
}
const fresh = (): Db => ({ sid: 101, started: false, completed: [], scores: [], done: false, xp: 365, streak: 3, seen: {}, counts: { spell: 0, meaning: 0, sentence: 0 }, subs: {}, spellOk: {}, meaningOk: {}, best: {} });
function load(): Db { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return fresh(); } }
let db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } };
const net = async () => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiRequestError(0, 'network', 'offline');
  await new Promise((r) => setTimeout(r, 60));
  db = load();
};
const bad = (status: number, code: ApiRequestError['code'], msg: string) => new ApiRequestError(status, code, msg);
const authed = () => { if (!db.token || localStorage.getItem('shabd.token') !== db.token) throw bad(401, 'unauthorized', 'login'); };

function level(xp: number) { let l = 0; while (xp >= 500 * ((l + 1) * (l + 2)) / 2) l++; const lo = 500 * (l * (l + 1)) / 2; const hi = 500 * ((l + 1) * (l + 2)) / 2; return { level: l, xpIntoLevel: xp - lo, xpForNextLevel: hi - lo }; }

function evaluate(text: string, w: Word): SentenceEvaluation {
  const zero = { use: 0, grammar: 0, relevance: 0, length: 0 };
  const mk = (gate: SentenceEvaluation['gate'], rubric = zero, feedback: FeedbackItem[] = []): SentenceEvaluation => ({
    gate, rubric, rawTotal: Object.values(rubric).reduce((a, b) => a + b, 0), errorCodes: [], confidence: 0.9, feedback, evaluator: 'mock', tip: gate === 'ok' ? 'Nice! Add more details next time.' : undefined,
  });
  if (!text.trim()) return mk('empty');
  if (/[ऀ-ॿ]/.test(text)) return mk('devanagari');
  if (!text.toLowerCase().includes(w.word.slice(0, Math.max(3, w.word.length - 2)))) return mk('word_missing');
  const n = text.trim().split(/\s+/).length;
  const cap = /^[A-Z]/.test(text), stop = /[.!?]$/.test(text);
  const rubric = { use: 10, grammar: 4 + (cap ? 3 : 0) + (stop ? 3 : 0), relevance: 8, length: n >= 6 ? 8 : n >= 4 ? 4 : 0 };
  return mk('ok', rubric, [
    { key: 'used_word', ok: true, message: 'You used the word!' },
    { key: 'capital', ok: cap, message: cap ? 'Capital letter' : 'Start with a capital' },
    { key: 'full_stop', ok: stop, message: stop ? 'Full stop' : 'End with a full stop' },
    { key: n >= 6 ? 'long_enough' : 'too_short', ok: n >= 6, message: n >= 6 ? 'Good length' : 'Make it longer' },
  ]);
}

function install() {
  Object.assign(api, {
    async publicRoster(code: string) { await net(); if (code.toUpperCase() !== 'DEMO5A') throw bad(404, 'not_found', 'no class'); return { className: '5A', students: STUDENTS }; },
    async studentLogin(b: { classCode: string; studentId: number; pin: string }) {
      await net();
      if (b.pin !== '1234') throw bad(401, 'unauthorized', 'wrong pin');
      const s = STUDENTS.find((x) => x.id === b.studentId) ?? STUDENTS[0];
      db.token = 'mock-' + Math.random().toString(16).slice(2); save();
      return { token: db.token, className: '5A', student: { id: s.id, classId: 1, rollNo: s.id, firstName: s.firstName, avatar: s.avatar, active: true } };
    },
    async logout() { return undefined; },
    async studentHome(): Promise<StudentHomeRes> {
      await net(); authed();
      return {
        student: { id: 1, classId: 1, rollNo: 1, firstName: 'Riya', avatar: '🦁', active: true }, className: '5A', leaderboardMode: 'individual',
        today: { date: DATE, dayIndex: 1, status: db.done ? 'completed' : db.started ? 'in_progress' : 'not_started', wordsDone: db.completed.length, sessionId: db.started ? db.sid : null },
        streak: db.streak, bestStreak: 5, xpTotal: db.xp, xpWeek: 120, level: level(db.xp),
      };
    },
    async startToday(): Promise<TodaySessionRes> {
      await net(); authed(); db.started = true; save();
      return {
        session: { id: db.sid, date: DATE, dayIndex: 1, startedAt: new Date().toISOString(), completedAt: db.done ? new Date().toISOString() : null },
        words: WORDS, progress: { completedWordIds: db.completed, wordScores: db.scores },
      };
    },
    async postAttempts(_sid: number, b: AttemptsReq): Promise<AttemptsRes> {
      await net(); authed();
      const accepted: string[] = [];
      for (const a of b.spell ?? []) {
        accepted.push(a.clientId);
        if (db.seen[a.clientId]) continue;
        db.seen[a.clientId] = 1; db.counts.spell++;
        const w = WORDS.find((x) => x.id === a.wordId)!;
        if (a.input === w.word && !db.spellOk[a.wordId]) db.spellOk[a.wordId] = a.attemptNo;
        else if (a.attemptNo === 3 && !(a.wordId in db.spellOk)) db.spellOk[a.wordId] = null;
      }
      for (const a of b.meaning ?? []) {
        accepted.push(a.clientId);
        if (db.seen[a.clientId]) continue;
        db.seen[a.clientId] = 1; db.counts.meaning++;
        if (a.isCorrect) db.meaningOk[a.wordId] = a.attemptNo;
      }
      save();
      return { accepted, classifications: {} };
    },
    async postSentence(_sid: number, b: SentenceReq): Promise<SentenceRes> {
      await net(); authed();
      const w = WORDS.find((x) => x.id === b.wordId)!;
      const evaluation = evaluate(b.text, w);
      if (evaluation.gate !== 'ok') return { evaluation, counted: false, finalMarks: null };
      if (!db.seen[b.clientId]) {
        db.seen[b.clientId] = 1; db.counts.sentence++;
        const marks = Math.round(evaluation.rawTotal * (b.submissionNo === 1 ? 1 : 0.8)) - (b.starterHintUsed ? 5 : 0);
        db.best[b.wordId] = Math.max(db.best[b.wordId] ?? 0, Math.max(0, marks));
        save();
      }
      return { evaluation, counted: true, finalMarks: db.best[b.wordId] ?? 0 };
    },
    async completeWord(_sid: number, wordId: string): Promise<WordScore> {
      await net(); authed();
      const ex = db.scores.find((s) => s.wordId === wordId);
      if (ex) return ex;
      const sp = Math.round(40 * ([1, 0.6, 0.3][(db.spellOk[wordId] ?? 4) - 1] ?? 0));
      const mn = db.meaningOk[wordId] === 1 ? 20 : db.meaningOk[wordId] === 2 ? 8 : 0;
      const total = sp + mn + (db.best[wordId] ?? 0);
      const s: WordScore = { wordId, spelling: sp, meaning: mn, sentence: db.best[wordId] ?? 0, total, stars: total >= 90 ? 3 : total >= 60 ? 2 : total >= 30 ? 1 : 0 };
      db.scores.push(s); db.completed.push(wordId); save();
      return s;
    },
    async completeSession(): Promise<SessionSummaryRes> {
      await net(); authed();
      if (db.summary) return db.summary;
      const wm = db.scores.reduce((a, s) => a + s.total, 0);
      const xp = { wordMarks: wm, completionBonus: 25, streakBonus: 20, perfectBonus: 0, total: wm + 45 };
      if (!db.done) { db.done = true; db.xp += xp.total; db.streak += 1; }
      db.summary = { sessionId: db.sid, date: DATE, wordScores: db.scores, totalMarks: wm, xp, streak: { current: db.streak, best: db.streak, lastCompletedDate: DATE }, xpTotal: db.xp, level: level(db.xp) };
      save();
      return db.summary;
    },
    async studentLeaderboard(): Promise<LeaderboardRes> {
      await net(); authed();
      const entries = STUDENTS.map((s, i) => ({ rank: i + 1, studentId: s.id, firstName: s.firstName, avatar: s.avatar, xp: 900 - i * 150, isMe: s.id === 1 }));
      return { period: 'week', weekStart: '2026-11-16', mode: 'individual', entries, me: entries[0] };
    },
  });
}

export function installMock(): void {
  install();
  (window as unknown as { __mock: unknown }).__mock = {
    counts: () => { db = load(); return db.counts; },
    reset: () => { localStorage.clear(); db = fresh(); save(); },
  };
}
