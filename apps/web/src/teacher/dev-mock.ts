/**
 * Local in-browser mock of the teacher API (enabled with ?mock=1). Replaces methods on the shared `api` object,
 * so no contract file is touched. Data is in memory and resets on reload.
 */
import type {
  ClassAnalyticsRes, ClassRoom, DailySet, SentenceErrorCode, SpellingErrorCode, StudentDetailRes,
  StudentErrorProfile, StudentWithPin, Word,
} from '@shabd/core';
import { ApiRequestError, api, getToken } from '../shared/api.ts';
import { addDays, istToday } from './util.ts';

const WORDS = ['whisper', 'knight', 'enormous', 'brave', 'gentle', 'journey', 'curious', 'delicious', 'ancient', 'harvest',
  'festival', 'rescue', 'crowded', 'fragile', 'neighbour', 'weather', 'thunder', 'giggle', 'borrow', 'victory',
  'tremble', 'bargain', 'glimpse', 'peaceful', 'wander'];
const bank: Word[] = WORDS.map((w, i) => ({
  id: `d${String(Math.floor(i / 5) + 1).padStart(3, '0')}-${(i % 5) + 1}`, dayIndex: Math.floor(i / 5) + 1, source: 'bank',
  word: w, partOfSpeech: i % 3 === 0 ? 'verb' : i % 3 === 1 ? 'adjective' : 'noun', difficulty: ((i % 3) + 1) as 1 | 2 | 3,
  meaning: `simple meaning of word number ${i + 1}`, meaningMarathi: 'सोपा अर्थ',
  exampleSentence: `This is an example with ${w}.`, distractorMeanings: ['a wrong one', 'another wrong one'],
  syllables: [w], tags: ['school'], contextWords: ['day', 'school', 'friend'],
}));
const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🐧', '🦄'];

let nextStudent = 1;
const mk = (roll: number, name: string): StudentWithPin => ({
  id: nextStudent++, classId: 1, rollNo: roll, firstName: name, avatar: AVATARS[(roll - 1) % AVATARS.length],
  active: true, pin: String(1000 + roll * 37).slice(0, 4),
});
let roster: StudentWithPin[] = [mk(1, 'Riya'), mk(2, 'Arjun'), mk(3, 'सानिका'), mk(4, 'Kabir'), mk(5, 'Meera'), mk(6, 'Omkar'), mk(7, 'Tara'), mk(8, 'Yash'), mk(9, 'Neha'), mk(10, 'Dev')];
let klass: ClassRoom = { id: 1, teacherId: 1, name: '5A', classCode: 'DEMO5A', startDate: addDays(istToday(), -20), leaderboardMode: 'individual' };
const overrides = new Map<string, string[]>();

const dayIndex = (date: string) => Math.max(1, Math.round((Date.parse(date) - Date.parse(klass.startDate)) / 864e5) + 1);
function autoSet(date: string): DailySet {
  const d = ((dayIndex(date) - 1) % 5) + 1;
  return { classId: 1, date, dayIndex: dayIndex(date), source: 'auto', words: bank.filter((w) => w.dayIndex === d) };
}
function setFor(date: string): DailySet {
  const ids = overrides.get(date);
  if (!ids) return autoSet(date);
  const all = [...bank, ...custom];
  return { classId: 1, date, dayIndex: dayIndex(date), source: 'teacher', words: ids.map((id) => all.find((w) => w.id === id)!) };
}
const custom: Word[] = [];

const fail = (status: number, code: ApiRequestError['code'], msg: string) => new ApiRequestError(status, code, msg);
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

// Stable pseudo-random data per student
const rnd = (seed: number) => { let s = seed * 9301 + 49297; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };
function profile(s: StudentWithPin): StudentErrorProfile {
  const r = rnd(s.id + 3);
  const sp: Partial<Record<SpellingErrorCode, number>> = {
    SP_PHONETIC: Math.floor(r() * 8), SP_VOWEL: Math.floor(r() * 6), SP_DOUBLE: Math.floor(r() * 5), SP_TRANSPOSE: Math.floor(r() * 3),
    SP_SILENT: s.id === 1 ? 14 : Math.floor(r() * 3),
  };
  const sn: Partial<Record<SentenceErrorCode, number>> = {
    SN_CAPITAL: Math.floor(r() * 9), SN_PUNCT: Math.floor(r() * 7), SN_TOO_SHORT: Math.floor(r() * 5), SN_NO_VERB: Math.floor(r() * 3),
  };
  return {
    studentId: s.id, firstName: s.firstName, avatar: s.avatar, sessionsCompleted: 3 + s.id, spellingWords: 20,
    spellingStrength: Math.round(40 + r() * 55), sentenceStrength: Math.round(30 + r() * 60),
    spellingErrorCounts: sp, sentenceErrorCounts: sn,
    rubricAverages: { use: 6 + r() * 4, grammar: 4 + r() * 5, relevance: 6 + r() * 5, length: 3 + r() * 5 },
    weaknessLabels: s.id === 1 ? ['Needs support: Silent letters'] : [],
  };
}

const csv = (type: string) => '﻿' + (type === 'students'
  ? 'roll_no,first_name,sessions_completed\r\n' + roster.map((s) => `${s.rollNo},${s.firstName},3`).join('\r\n') + '\r\n'
  : `date,roll_no,first_name\r\n${istToday()},1,Riya\r\n`);

export function installMock(): void {
  const teacher = { id: 1, name: 'Demo Teacher', email: 'demo@school.test' };
  Object.assign(api, {
    me: () => (getToken() ? delay({ role: 'teacher' as const, teacher }) : Promise.reject(fail(401, 'unauthorized', 'Log in'))),
    logout: () => delay(undefined),
    teacherLogin: (b: { email: string; password: string }) =>
      b.email === 'demo@school.test' && b.password === 'demo1234' ? delay({ token: 'mock-token', teacher }) : Promise.reject(fail(401, 'unauthorized', 'Wrong email or password')),
    teacherRegister: () => delay({ token: 'mock-token', teacher }),
    listClasses: () => delay([klass]),
    createClass: (b: { name: string; startDate?: string }) => { klass = { ...klass, name: b.name, startDate: b.startDate ?? klass.startDate }; return delay(klass); },
    updateClass: (_id: number, b: Partial<ClassRoom>) => { klass = { ...klass, ...b }; return delay(klass); },
    roster: () => delay([...roster]),
    addStudents: (_id: number, b: { students: { rollNo: number; firstName: string }[] }) => {
      for (const n of b.students) if (roster.some((s) => s.rollNo === n.rollNo)) return Promise.reject(fail(409, 'conflict', `Roll ${n.rollNo} already exists`));
      roster = [...roster, ...b.students.map((n) => mk(n.rollNo, n.firstName))];
      return delay([...roster]);
    },
    updateStudent: (id: number, b: Partial<StudentWithPin>) => {
      roster = roster.map((s) => (s.id === id ? { ...s, ...b } : s)); return delay(roster.find((s) => s.id === id)!);
    },
    resetPin: (id: number) => {
      roster = roster.map((s) => (s.id === id ? { ...s, pin: String(1000 + Math.floor(Math.random() * 9000)) } : s)); return delay(roster.find((s) => s.id === id)!);
    },
    searchWords: (q: { q?: string; difficulty?: number; partOfSpeech?: string; tag?: string; limit?: number }) => {
      const all = [...bank, ...custom].filter((w) =>
        (!q.q || (w.word + w.meaning).includes(q.q.toLowerCase())) && (!q.difficulty || w.difficulty === q.difficulty)
        && (!q.partOfSpeech || w.partOfSpeech === q.partOfSpeech) && (!q.tag || w.tags.includes(q.tag)));
      return delay({ total: all.length, items: all.slice(0, q.limit ?? 50) });
    },
    createWord: (b: Omit<Word, 'id' | 'dayIndex' | 'source'>) => {
      const w: Word = { ...b, id: `t-${custom.length + 1}`, dayIndex: null, source: 'teacher' }; custom.push(w); return delay(w);
    },
    dailyWords: (_id: number, date?: string) => delay(setFor(date ?? istToday())),
    setDailyWords: (_id: number, date: string, b: { wordIds: string[] }) => { overrides.set(date, b.wordIds); return delay(setFor(date)); },
    resetDailyWords: (_id: number, date: string) => { overrides.delete(date); return delay(setFor(date)); },
    dashboard: (_id: number, date?: string) => {
      const d = date ?? istToday();
      const students = roster.filter((s) => s.active).map((s, i) => {
        const status = (['completed', 'in_progress', 'not_started'] as const)[i % 3];
        return { studentId: s.id, rollNo: s.rollNo, firstName: s.firstName, avatar: s.avatar, status,
          wordsDone: status === 'completed' ? 5 : status === 'in_progress' ? 2 : 0,
          totalMarks: status === 'not_started' ? null : 300 + i * 20, streak: i + 1, xpWeek: 200 + i * 35 };
      });
      return delay({ date: d, dayIndex: dayIndex(d), set: setFor(d), completedCount: students.filter((s) => s.status === 'completed').length, students });
    },
    classLeaderboard: (_id: number, period: 'week' | 'all' = 'week') => delay({
      period, weekStart: istToday(), mode: klass.leaderboardMode,
      entries: roster.map((s, i) => ({ rank: i + 1, studentId: s.id, firstName: s.firstName, avatar: s.avatar, xp: (period === 'all' ? 2000 : 400) - i * 55 })),
    }),
    classAnalytics: (_id: number, from?: string, to?: string) => {
      const res: ClassAnalyticsRes = {
        from: from ?? addDays(istToday(), -30), to: to ?? istToday(), students: roster.map(profile),
        classSpellingRates: { SP_PHONETIC: 0.3, SP_VOWEL: 0.2, SP_DOUBLE: 0.15, SP_SILENT: 0.1, SP_TRANSPOSE: 0.08 },
        classSentenceRates: { SN_CAPITAL: 0.3, SN_PUNCT: 0.25, SN_TOO_SHORT: 0.15, SN_NO_VERB: 0.08 },
        hardestWords: bank.slice(0, 5).map((w, i) => ({ wordId: w.id, word: w.word, attempts: 30 - i, firstAttemptAccuracy: 0.3 + i * 0.08 })),
      };
      return delay(res);
    },
    studentDetail: (id: number) => {
      const s = roster.find((x) => x.id === id);
      if (!s) return Promise.reject(fail(404, 'not_found', 'Student not found'));
      const res: StudentDetailRes = {
        student: s, profile: profile(s),
        sessions: [0, 1, 2].map((i) => ({
          sessionId: i + 1, date: addDays(istToday(), -i), wordScores: [], totalMarks: 380 - i * 30,
          xp: { wordMarks: 300, completionBonus: 25, streakBonus: 20, perfectBonus: 0, total: 345 }, streak: { current: 3 - i, best: 5, lastCompletedDate: null },
          xpTotal: 900, level: { level: 1, xpIntoLevel: 400, xpForNextLevel: 1000 },
        })),
        spellingErrors: [
          { date: istToday(), word: 'whisper', input: 'wisper', attemptNo: 1, primary: 'SP_SILENT', tags: ['SP_SILENT'] },
          { date: istToday(), word: 'knight', input: 'nite', attemptNo: 1, primary: 'SP_SILENT', tags: ['SP_SILENT', 'SP_PHONETIC'] },
          { date: istToday(), word: 'enormous', input: 'enormus', attemptNo: 2, primary: 'SP_VOWEL', tags: ['SP_VOWEL'] },
        ],
        sentences: [{
          date: istToday(), word: 'brave', text: 'the brave boy', submissionNo: 1, rubric: { use: 10, grammar: 4, relevance: 8, length: 2 }, finalMarks: 24,
          errorCodes: ['SN_CAPITAL', 'SN_NO_VERB'], evaluator: 'rules-1', tip: 'Add a doing word.',
        }],
      };
      return delay(res);
    },
    exportCsvPath: (id: number, type: string) => `/api/classes/${id}/export.csv?type=${type}`,
  });
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const m = /export\.csv\?type=(\w+)/.exec(url);
    if (!m) return realFetch(input, init);
    return Promise.resolve(new Response(csv(m[1]), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="5A-${m[1]}-${istToday()}.csv"` },
    }));
  };
}
