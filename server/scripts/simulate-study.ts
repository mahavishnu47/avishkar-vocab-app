/**
 * WordWise two-week study SIMULATION (assumption-driven). Drives the real Express app in-process (supertest, no port)
 * against a LOCAL Postgres database and writes a realistic-looking study: one school, one teacher, two Std 5 classes
 * (5A = intervention, 5B = comparison), 12 children each, pre-test (Form A) on 2026-11-02, ten school days of play
 * (2026-11-02..2026-11-13, 5 words/day), post-test (Form B) on 2026-11-16.
 *
 * THIS IS NOT EVIDENCE THAT THE APP WORKS. Child behaviour (ability, attendance, spelling, multiple choice answers)
 * is drawn from a seeded PRNG using the assumptions documented in docs/SIMULATION_REPORT.md. The point is to exercise
 * the pipeline and populate dashboards.
 *
 * Safety: refuses any database host other than localhost / 127.0.0.1. Never drops or truncates anything. Each run
 * creates a NEW school (name "WordWise Sim", "WordWise Sim 2", ...) so earlier runs are left untouched.
 *
 * Usage (from server/):
 *   SIM_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/shabd_local npx tsx scripts/simulate-study.ts
 * Optional env:
 *   SIM_SEED=20261102          PRNG seed (default 20261102)
 *   SIM_OUT_DIR=<dir>          also write the raw API payloads (JSON and CSV) into this directory
 *   SIM_SCHOOL_NAME=<name>     base school name (a numeric suffix is added if it is already used)
 * Prints the human summary and a JSON block between SIM_SUMMARY_BEGIN and SIM_SUMMARY_END markers.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { createDb, migrate, setDb, type DB } from '../src/db/db.ts';
import { loadWordBank } from '../src/db/seed.ts';

// ------------------------------------------------------------------ environment

const DB_URL = process.env.SIM_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/shabd_local';
const dbHost = new URL(DB_URL).hostname;
if (!['127.0.0.1', 'localhost'].includes(dbHost)) throw new Error(`refusing to simulate against non-local host ${dbHost}`);
process.env.DATABASE_URL = DB_URL;
process.env.SUPER_ADMIN_SECRET = process.env.SUPER_ADMIN_SECRET ?? 'sim-local-admin-secret-0123456789';
process.env.RATE_LIMIT_OFF = '1';
delete process.env.ANTHROPIC_API_KEY; // keep Section C on the deterministic rule-based marker
delete process.env.PUBLIC_APP_URL;
delete process.env.VERCEL_ENV;

const ROOT = resolve(import.meta.dirname, '../..');
const OUT_DIR = process.env.SIM_OUT_DIR;
const SEED = Number(process.env.SIM_SEED ?? 20261102);
const BASE_SCHOOL = process.env.SIM_SCHOOL_NAME ?? 'WordWise Sim';
const STUDY_NAME = 'WordWise two-week trial';
const STUDY_START = '2026-11-02';
const SCHOOL_DAYS = 10;
const WORDS_PER_DAY = 5;
const POST_DATE = '2026-11-16';
const STUDY_DATES = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
const TEACHER_PASSWORD = 'simteacher1';
const POS = ['noun', 'verb', 'adjective', 'adverb'] as const;

const formA = JSON.parse(readFileSync(resolve(ROOT, 'server/src/research/assessment-forms/form-a.json'), 'utf8')) as Form;
const formB = JSON.parse(readFileSync(resolve(ROOT, 'server/src/research/assessment-forms/form-b.json'), 'utf8')) as Form;
const PLAN = JSON.parse(readFileSync(resolve(ROOT, 'content/study/word-a-day-100.json'), 'utf8')) as { days: { day: number; wordIds: string[] }[] };

interface FormItemA { id: string; wordId: string; word: string; correct: string; distractors: string[] }
interface FormItemB { id: string; wordId: string; word: string; answer: string }
interface FormItemC { id: string; wordId: string; word: string; exampleSentence: string }
interface Form { formId: string; sectionA: FormItemA[]; sectionB: FormItemB[]; sectionC: FormItemC[] }

// ------------------------------------------------------------------ seeded PRNG (mulberry32)

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const chance = (p: number): boolean => rng() < p;
const randInt = (lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
const shuffle = <T,>(xs: readonly T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
};
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const round2 = (x: number): number => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ bookkeeping

interface ApiError { day: string; method: string; url: string; status: number; body: string }
const apiErrors: ApiError[] = [];
const expectedGate409: { day: string; studentId: number; body: string }[] = [];
const notes: string[] = [];

function snip(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 300 ? `${s.slice(0, 300)}...` : s;
}

let currentDay = 'setup';
const app = createApp();
const db: DB = createDb(DB_URL, { max: 5 });
setDb(db);

async function call(method: 'get' | 'post' | 'put' | 'patch', url: string, token: string | null, body?: unknown, expect: number[] = [200, 201, 204]) {
  let req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) req = req.send(body as object);
  const res = await req;
  if (!expect.includes(res.status)) apiErrors.push({ day: currentDay, method: method.toUpperCase(), url, status: res.status, body: snip(res.body) });
  return res;
}

// ------------------------------------------------------------------ setup: migrations, word bank, school, teacher

async function setupDatabase(): Promise<void> {
  const ran = await migrate(db);
  console.log(`[sim] migrations: ${ran.length ? `applied ${ran.join(', ')}` : 'already up to date'}`);
  const loaded = await loadWordBank(db, resolve(ROOT, 'content/words'));
  const bank = (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM words WHERE source = 'bank'"))!.n;
  console.log(`[sim] word bank: upserted ${loaded}, bank now has ${bank} words`);
  const planIds = PLAN.days.flatMap((d) => d.wordIds);
  const found = (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM words WHERE id = ANY(?::text[])', [planIds]))!.n;
  if (found !== planIds.length) throw new Error(`plan words missing from bank: ${found}/${planIds.length}`);
}

async function pickSchoolName(): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? BASE_SCHOOL : `${BASE_SCHOOL} ${n}`;
    const hit = await db.get('SELECT id FROM schools WHERE name = ?', [name]);
    if (!hit) return name;
  }
  throw new Error('no free school name');
}

interface Setup { schoolId: number; schoolName: string; studentCode: string; teacherToken: string; teacherEmail: string; teacherId: number; teacherName: string; principalEmail: string }

async function createSchoolAndTeacher(schoolName: string): Promise<Setup> {
  currentDay = 'setup';
  const tag = process.env.SIM_EMAIL_TAG ?? (schoolName.replace(/[^0-9]/g, '') || '1');
  const principalEmail = `principal-sim-${tag}@school.test`;
  const teacherEmail = `wordwise-sim-${tag}@school.test`;
  return finishSchoolSetup(schoolName, principalEmail, teacherEmail);
}

async function finishSchoolSetup(schoolName: string, principalEmail: string, teacherEmail: string): Promise<Setup> {
  const created = await request(app).post('/api/admin/schools').set('X-Admin-Secret', process.env.SUPER_ADMIN_SECRET!).send({ name: schoolName, district: 'Thane' });
  if (created.status !== 201) throw new Error(`create school failed: ${created.status} ${snip(created.body)}`);
  const setup = await request(app).post('/api/auth/school/setup').send({ code: created.body.setupInvite.code, name: 'Principal (sim)', email: principalEmail, password: 'password1' });
  if (setup.status !== 201) throw new Error(`school setup failed: ${setup.status} ${snip(setup.body)}`);
  const info = await request(app).get('/api/school').set('Authorization', `Bearer ${setup.body.token}`);
  const reg = await request(app).post('/api/auth/teacher/register').send({ inviteCode: info.body.teacherInvite.code, name: 'Mrs. Sim Teacher', email: teacherEmail, password: TEACHER_PASSWORD });
  if (reg.status !== 201) throw new Error(`teacher register failed: ${reg.status} ${snip(reg.body)}`);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
  return {
    schoolId: created.body.school.id, schoolName, studentCode: created.body.school.studentCode,
    teacherToken: reg.body.token, teacherEmail, teacherId: me.body.teacher?.id ?? me.body.id ?? null, teacherName: 'Mrs. Sim Teacher', principalEmail,
  };
}

// ------------------------------------------------------------------ children

const NAMES_A = process.env.SIM_NAMES ? process.env.SIM_NAMES.split(',').map((x) => x.trim()).filter(Boolean) : ['Aarav', 'Ananya', 'Vihaan', 'Diya', 'Reyansh', 'Saanvi', 'Ishaan', 'Kiara', 'Arnav', 'Myra', 'Dhruv', 'Pari'];
const NAMES_B = process.env.SIM_NO_COMPARISON ? [] : ['Riya', 'Kabir', 'Aadhya', 'Om', 'Tanvi', 'Yash', 'Sia', 'Rohan', 'Meera', 'Atharv', 'Nisha', 'Krish'];
const ABILITY_BASE = [0.27, 0.31, 0.36, 0.42, 0.47, 0.52, 0.56, 0.61, 0.66, 0.72, 0.79, 0.84];

interface Child {
  studentId: number; rollNo: number; firstName: string; pin: string; classId: number; classCode: string; group: 'intervention' | 'comparison';
  ability: number; studyCode: string | null; token: string; skipDays: Set<number>; practised: Set<string>;
  daysPlayed: string[]; wordsCompleted: number; sessionsCompleted: number; recallAnswers: number; gate409: number;
  preMarks?: number; postMarks?: number;
}

interface ClassInfo { id: number; classCode: string; name: string; division: string; group: 'intervention' | 'comparison'; children: Child[] }

function abilitiesFor(n: number): number[] {
  // ABILITY_BASE has 12 values; for a bigger class cycle through it and spread each repeat a little more.
  const base: number[] = [];
  for (let r = 0; base.length < n; r++) for (const v of shuffle(ABILITY_BASE)) { if (base.length < n) base.push(r === 0 ? v : v + (rng() * 0.16 - 0.08)); }
  return base.map((a) => round2(clamp(a + (rng() * 0.04 - 0.02), 0.25, 0.85)));
}

async function createClass(division: string, names: string[], group: 'intervention' | 'comparison', token: string): Promise<ClassInfo> {
  const c = await call('post', '/api/classes', token, { standard: 5, division, startDate: STUDY_START }, [201]);
  const cls = c.body as { id: number; classCode: string; name: string };
  const s = await call('post', `/api/classes/${cls.id}/students`, token, {
    students: names.map((firstName, i) => ({ rollNo: i + 1, firstName })),
  }, [201]);
  const roster = s.body as { id: number; rollNo?: number; roll_no?: number; firstName?: string; first_name?: string; pin: string; classId?: number }[];
  const abilities = abilitiesFor(names.length);
  const children: Child[] = roster.map((st, i) => ({
    studentId: st.id, rollNo: i + 1, firstName: names[i]!, pin: st.pin, classId: cls.id, classCode: cls.classCode, group,
    ability: abilities[i]!, studyCode: null, token: '', skipDays: new Set<number>(), practised: new Set<string>(),
    daysPlayed: [], wordsCompleted: 0, sessionsCompleted: 0, recallAnswers: 0, gate409: 0,
  }));
  return { id: cls.id, classCode: cls.classCode, name: cls.name, division, group, children };
}

async function loginChildren(cls: ClassInfo): Promise<void> {
  for (const ch of cls.children) {
    const r = await call('post', '/api/auth/student/login', null, { classCode: cls.classCode, studentId: ch.studentId, pin: ch.pin }, [200]);
    ch.token = r.body.token as string;
  }
}

/** Attendance: weak children skip 1-3 of the ten school days, two lazy children miss 4+, the rest 0-1. */
function assignAttendance(cls: ClassInfo): void {
  if (cls.group !== 'intervention') return;
  const idx = shuffle(cls.children.map((_, i) => i)).slice(0, 2);
  cls.children.forEach((ch, i) => {
    let k: number;
    if (idx[0] === i) k = 4;
    else if (idx[1] === i) k = 6;
    else if (ch.ability < 0.45) k = randInt(1, 3);
    else k = chance(0.25) ? 1 : 0;
    ch.skipDays = new Set(shuffle(Array.from({ length: SCHOOL_DAYS }, (_, d) => d)).slice(0, k));
  });
}

// ------------------------------------------------------------------ child behaviour

function misspell(w: string): string {
  for (let tries = 0; tries < 12; tries++) {
    const i = randInt(1, w.length - 2);
    const kind = randInt(0, 2);
    let out: string;
    if (kind === 0) out = w.slice(0, i) + w.slice(i + 1); // a dropped letter
    else if (kind === 1) out = w.slice(0, i - 1) + w[i] + w[i - 1] + w.slice(i + 1); // a swapped pair
    else out = w.slice(0, i) + w[i] + w.slice(i); // a doubled letter
    if (out !== w) return out;
  }
  return w.slice(0, -1);
}

/** Section C / write-stage sentences: templated by ability tier. Marked by the real rule engine, not by this script. */
function sentenceFor(c: Child, word: string): string {
  // Child-specific wording, so 12 children writing the same word do not produce identical sentences.
  const n = c.firstName;
  if (c.ability >= 0.6) return pick([`${n} learned the word ${word} in class today and will remember it.`, `Yesterday my teacher said the ${word} is a new word, so ${n} wrote it down.`]);
  if (c.ability >= 0.4) return pick([`${n} likes the ${word} very much.`, `${n} saw a ${word} with a friend near the gate.`]);
  return `${word} is good for ${n}.`;
}

interface WordPayload { id: string; word: string; partOfSpeech: string; meaning: string; distractorMeanings: string[] }

/** Probability of a correct meaning/POS answer on a test item. Pre: 0.25+0.5*ability. Post: + 0.04 natural gain, +0.25 if practised (intervention), cap 0.95. */
function testProbability(c: Child, wordId: string, kind: 'pre' | 'post'): number {
  const base = 0.25 + 0.5 * c.ability;
  if (kind === 'pre') return base;
  let p = base + 0.04;
  if (c.group === 'intervention' && c.practised.has(wordId)) p += 0.25;
  return Math.min(p, 0.95);
}

function answerForm(c: Child, form: Form, items: { id: string; section: string; options?: string[] }[], kind: 'pre' | 'post') {
  const byA = new Map(form.sectionA.map((i) => [i.id, i]));
  const byB = new Map(form.sectionB.map((i) => [i.id, i]));
  const byC = new Map(form.sectionC.map((i) => [i.id, i]));
  // The server shuffles item order and option order per attempt (Math.random order_seed). Sort both before drawing from
  // the PRNG so the same seed always produces the same answers.
  const canonical = [...items].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return canonical.map((it) => {
    let answer: string;
    if (it.section === 'A') {
      const f = byA.get(it.id)!;
      const options = [...(it.options ?? [])].sort();
      answer = chance(testProbability(c, f.wordId, kind)) ? f.correct : pick(options.filter((o) => o !== f.correct));
    } else if (it.section === 'B') {
      const f = byB.get(it.id)!;
      answer = chance(testProbability(c, f.wordId, kind)) ? f.answer : pick(POS.filter((p) => p !== f.answer));
    } else {
      const f = byC.get(it.id)!;
      answer = sentenceFor(c, f.word);
    }
    return { itemId: it.id, answer, msElapsed: randInt(4000, 40000), keystrokes: answer.length + randInt(0, 15), deletions: randInt(0, 6) };
  });
}

// ------------------------------------------------------------------ assessments

interface WindowResult { windowId: number; accessCode: string; kind: 'pre' | 'post'; formId: 'A' | 'B'; takers: number; resultsRows: unknown[]; window: unknown }

async function runAssessment(cls: ClassInfo, kind: 'pre' | 'post', token: string, date: string): Promise<WindowResult> {
  currentDay = `${date} ${kind}-test ${cls.name}`;
  const formId = kind === 'pre' ? 'A' : 'B';
  const form = kind === 'pre' ? formA : formB;
  const w = await call('post', `/api/classes/${cls.id}/assessments`, token, { kind, formId, mode: 'app', durationMin: 25 }, [201]);
  const windowId = w.body.id as number;
  const accessCode = w.body.accessCode as string;
  await call('patch', `/api/classes/${cls.id}/assessments/${windowId}`, token, { action: 'open' }, [200]);
  for (const ch of cls.children) {
    const cur = await call('get', '/api/student/assessments/current', ch.token, undefined, [200]);
    if (cur.body.assessment?.windowId !== windowId) apiErrors.push({ day: currentDay, method: 'GET', url: '/api/student/assessments/current', status: 0, body: `expected window ${windowId}, got ${snip(cur.body)}` });
    const start = await call('post', `/api/student/assessments/${windowId}/start`, ch.token, { accessCode }, [200, 201]);
    const items = start.body.items as { id: string; section: string; options?: string[] }[];
    const answers = answerForm(ch, form, items, kind);
    await call('put', `/api/student/assessments/${windowId}/responses`, ch.token, { items: answers }, [200]);
    await call('post', `/api/student/assessments/${windowId}/submit`, ch.token, {}, [200]);
  }
  await call('patch', `/api/classes/${cls.id}/assessments/${windowId}`, token, { action: 'close' }, [200]);
  const res = await call('get', `/api/classes/${cls.id}/assessments/${windowId}/results`, token, undefined, [200]);
  return { windowId, accessCode, kind, formId, takers: cls.children.length, resultsRows: res.body.rows, window: res.body.window };
}

// ------------------------------------------------------------------ daily play

interface DayTally { date: string; dayNo: number; playing5A: number; sessionsCompleted: number; wordsCompleted: number; spellingFirstTry: number; spellingTotal: number; recallAnswers: number; gate409for5B: number; mismatches: string[] }

async function playWord(c: Child, sessionId: number, w: WordPayload, date: string): Promise<{ firstTry: boolean }> {
  const clientTs = `${date}T10:${String(randInt(0, 59)).padStart(2, '0')}:00.000Z`;
  const base = `s${c.studentId}-${date.replace(/-/g, '')}-${w.id}`;
  const spell: Record<string, unknown>[] = [];
  let firstTry = false;
  for (let n = 1; n <= 3; n++) {
    const right = chance(n === 1 ? 0.1 + 0.8 * c.ability : 0.35 + 0.5 * c.ability);
    if (n === 1) firstTry = right;
    const hints = n > 1 && chance(0.4) ? ['first_letter'] : chance(0.1) ? ['letter_tiles'] : [];
    spell.push({ clientId: `${base}-sp${n}`, wordId: w.id, attemptNo: n, input: right ? w.word : misspell(w.word), hints, audioPlays: randInt(0, 2), msElapsed: randInt(2000, 15000), clientTs });
    if (right) break;
  }
  const meaning: Record<string, unknown>[] = [];
  const wrongMeanings = w.distractorMeanings;
  const firstM = chance(0.3 + 0.6 * c.ability) ? w.meaning : pick(wrongMeanings);
  meaning.push({ clientId: `${base}-mn1`, wordId: w.id, attemptNo: 1, chosen: firstM, isCorrect: firstM === w.meaning, msElapsed: randInt(2000, 12000), clientTs });
  if (firstM !== w.meaning) {
    const second = chance(0.7) ? w.meaning : wrongMeanings.find((m) => m !== firstM)!;
    meaning.push({ clientId: `${base}-mn2`, wordId: w.id, attemptNo: 2, chosen: second, isCorrect: second === w.meaning, msElapsed: randInt(2000, 12000), clientTs });
  }
  const pos: Record<string, unknown>[] = [];
  const firstP = chance(0.45 + 0.45 * c.ability) ? w.partOfSpeech : pick(POS.filter((p) => p !== w.partOfSpeech));
  pos.push({ clientId: `${base}-ps1`, wordId: w.id, attemptNo: 1, chosen: firstP, msElapsed: randInt(2000, 10000), clientTs });
  if (firstP !== w.partOfSpeech) {
    const second = chance(0.6) ? w.partOfSpeech : pick(POS.filter((p) => p !== w.partOfSpeech && p !== firstP));
    pos.push({ clientId: `${base}-ps2`, wordId: w.id, attemptNo: 2, chosen: second, msElapsed: randInt(2000, 10000), clientTs });
  }
  const a = await call('post', `/api/student/sessions/${sessionId}/attempts`, c.token, { spell, meaning, pos }, [200]);
  if (a.status !== 200) return { firstTry };
  const text = sentenceFor(c, w.word);
  await call('post', `/api/student/sessions/${sessionId}/sentences`, c.token, {
    clientId: `${base}-sen`, wordId: w.id, submissionNo: 1, text, starterHintUsed: false,
    msElapsed: randInt(8000, 40000), clientTs, keystrokes: text.length + randInt(0, 15), deletions: randInt(0, 6),
  }, [200]);
  const done = await call('post', `/api/student/sessions/${sessionId}/words/${w.id}/complete`, c.token, {}, [200]);
  if (done.status === 200) { c.practised.add(w.id); c.wordsCompleted++; }
  return { firstTry };
}

async function recallForChild(c: Child, date: string, tally: DayTally): Promise<void> {
  const rec = await call('get', '/api/student/recall/today', c.token, undefined, [200]);
  const items = (rec.body.items as { itemId: string; wordId: string; options: string[] }[])
    .slice().sort((x, y) => (x.itemId < y.itemId ? -1 : x.itemId > y.itemId ? 1 : 0)).slice(0, 20);
  if (items.length === 0) return;
  const answers = [];
  for (const [i, it] of items.entries()) {
    const row = await db.get<{ word: string; meaning: string }>('SELECT word, meaning FROM words WHERE id = ?', [it.wordId]);
    const options = [...it.options].sort();
    const truth = options.find((o) => o === row?.meaning) ?? options.find((o) => o === row?.word) ?? options[0]!;
    const knows = chance(0.15 + 0.5 * c.ability + (c.practised.has(it.wordId) ? 0.15 : 0));
    const wrong = options.filter((o) => o !== truth);
    const chosen = knows || wrong.length === 0 ? truth : pick(wrong);
    answers.push({ clientId: `rc${c.studentId}-${date.replace(/-/g, '')}-${i}`, itemId: it.itemId, chosen, msElapsed: randInt(2000, 12000), clientTs: `${date}T11:00:00.000Z` });
  }
  const r = await call('post', '/api/student/recall/answers', c.token, { answers }, [200]);
  if (r.status === 200) { c.recallAnswers += answers.length; tally.recallAnswers += answers.length; }
}

async function playDay(cls: ClassInfo, date: string, dayNo: number, tally: DayTally): Promise<void> {
  process.env.FAKE_TODAY = date;
  for (const c of cls.children) {
    currentDay = `${date} day ${dayNo} ${cls.name}`;
    if (cls.group === 'comparison') {
      // Comparison children do not use the app. We still probe the gate so the 409 shows up in the audit.
      const r = await call('post', '/api/student/sessions/today', c.token, {}, [409]);
      if (r.status === 409) { c.gate409++; tally.gate409for5B++; expectedGate409.push({ day: date, studentId: c.studentId, body: snip(r.body) }); }
      continue;
    }
    if (c.skipDays.has(dayNo - 1)) continue; // absent / did not open the app today
    const study = await call('get', '/api/student/study-day', c.token, undefined, [200]);
    if (study.body.dayNo !== dayNo || study.body.reason !== 'study_day') tally.mismatches.push(`${c.firstName}: study-day ${snip(study.body)}`);
    const s = await call('post', '/api/student/sessions/today', c.token, {}, [200]);
    if (s.status !== 200) continue;
    const sessionId = s.body.session.id as number;
    if (s.body.session.dayIndex !== dayNo) tally.mismatches.push(`${c.firstName}: dayIndex ${s.body.session.dayIndex}`);
    const words = s.body.words as WordPayload[];
    if (words.length !== WORDS_PER_DAY) tally.mismatches.push(`${c.firstName}: ${words.length} words`);
    tally.playing5A++;
    c.daysPlayed.push(date);
    for (const w of words) {
      const r = await playWord(c, sessionId, w, date);
      tally.spellingTotal++;
      if (r.firstTry) tally.spellingFirstTry++;
    }
    const fin = await call('post', `/api/student/sessions/${sessionId}/complete`, c.token, {}, [200]);
    if (fin.status === 200) { c.sessionsCompleted++; tally.sessionsCompleted++; tally.wordsCompleted += words.length; }
    await recallForChild(c, date, tally);
  }
}

// ------------------------------------------------------------------ reporting helpers

function meanOf(xs: number[]): number | null { return xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null; }

interface Row { studentId: number; status: string; a: number | null; b: number | null; c: number | null; total: number | null }

function summariseWindow(rows: Row[]) {
  const done = rows.filter((r) => r.total !== null);
  const col = (k: 'a' | 'b' | 'c' | 'total') => done.map((r) => Number(r[k] ?? 0));
  return { n: done.length, meanTotal: meanOf(col('total')), meanA: meanOf(col('a')), meanB: meanOf(col('b')), meanC: meanOf(col('c')) };
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  const t0 = Date.now();
  await setupDatabase();

  const schoolName = await pickSchoolName();
  const school = await createSchoolAndTeacher(schoolName);
  const token = school.teacherToken;
  console.log(`[sim] school "${school.schoolName}" (id ${school.schoolId}, student code ${school.studentCode}); teacher ${school.teacherEmail}`);

  // Classes and children. Students are created by the teacher API; the PIN is whatever the API returns.
  process.env.FAKE_TODAY = STUDY_START;
  const A = await createClass('A', NAMES_A, 'intervention', token);
  const B = NAMES_B.length ? await createClass('B', NAMES_B, 'comparison', token) : null;
  const CLASSES = B ? [A, B] : [A];
  for (const cls of CLASSES) assignAttendance(cls);
  await loginChildren(A);
  if (B) await loginChildren(B);

  // Study: attach both classes, start it, give consent to every child.
  currentDay = 'study setup';
  const st = await call('post', '/api/studies', token, {
    name: STUDY_NAME, startDate: STUDY_START, schoolDays: SCHOOL_DAYS, wordsPerDay: WORDS_PER_DAY,
    classes: B ? [{ classId: A.id, group: 'intervention' }, { classId: B.id, group: 'comparison' }] : [{ classId: A.id, group: 'intervention' }],
  }, [201]);
  const studyId = st.body.id as number;
  await call('patch', `/api/studies/${studyId}`, token, { status: 'running' }, [200]);
  const parts = (await call('get', `/api/studies/${studyId}/participants`, token, undefined, [200])).body as { studentId: number; studyCode: string }[];
  const codeOf = new Map(parts.map((p) => [p.studentId, p.studyCode]));
  for (const cls of CLASSES) for (const ch of cls.children) {
    ch.studyCode = codeOf.get(ch.studentId) ?? null;
    await call('patch', `/api/studies/${studyId}/participants/${ch.studentId}`, token, { consent: 'given' }, [200]);
  }
  const plan = (await call('get', `/api/studies/${studyId}/plan`, token, undefined, [200])).body as { warnings: string[]; posCounts: Record<string, number> };
  console.log(`[sim] study ${studyId} "${STUDY_NAME}" running; plan POS counts ${JSON.stringify(plan.posCounts)}; warnings ${JSON.stringify(plan.warnings)}`);

  // Pre-test, both classes, 2026-11-02, before day 1.
  process.env.FAKE_TODAY = STUDY_START;
  const preA = await runAssessment(A, 'pre', token, STUDY_START);
  const preB = B ? await runAssessment(B, 'pre', token, STUDY_START) : null;
  console.log('[sim] pre-tests done');

  // Ten school days of play for 5A. 5B only gets the gate probe.
  const tallies: DayTally[] = [];
  for (const [i, date] of STUDY_DATES.entries()) {
    currentDay = `${date} day ${i + 1}`;
    const tally: DayTally = { date, dayNo: i + 1, playing5A: 0, sessionsCompleted: 0, wordsCompleted: 0, spellingFirstTry: 0, spellingTotal: 0, recallAnswers: 0, gate409for5B: 0, mismatches: [] };
    await playDay(A, date, i + 1, tally);
    if (B) await playDay(B, date, i + 1, tally);
    tallies.push(tally);
    console.log(`[sim] day ${i + 1} ${date}: 5A playing ${tally.playing5A}/12, sessions completed ${tally.sessionsCompleted}, words ${tally.wordsCompleted}, 5B gate 409s ${tally.gate409for5B}`);
  }

  // Post-test, both classes, Monday 2026-11-16.
  process.env.FAKE_TODAY = POST_DATE;
  const postA = await runAssessment(A, 'post', token, POST_DATE);
  const postB = B ? await runAssessment(B, 'post', token, POST_DATE) : null;
  console.log('[sim] post-tests done');

  // Read everything back through the teacher API.
  currentDay = 'reads';
  const results = (await call('get', `/api/studies/${studyId}/results`, token, undefined, [200])).body;
  const studyDetail = (await call('get', `/api/studies/${studyId}`, token, undefined, [200])).body;
  const progA = (await call('get', `/api/classes/${A.id}/progress?from=${STUDY_START}&to=${POST_DATE}`, token, undefined, [200])).body;
  const progB = !B ? {} : (await call('get', `/api/classes/${B.id}/progress?from=${STUDY_START}&to=${POST_DATE}`, token, undefined, [200])).body;
  const scoresCsv = (await call('get', `/api/studies/${studyId}/export.csv?type=scores`, token, undefined, [200])).text;
  const partCsv = (await call('get', `/api/studies/${studyId}/export.csv?type=participation`, token, undefined, [200])).text;
  const summaryCsv = (await call('get', `/api/studies/${studyId}/export.csv?type=summary`, token, undefined, [200])).text;
  const windowsA = (await call('get', `/api/classes/${A.id}/assessments`, token, undefined, [200])).body;
  const windowsB = !B ? {} : (await call('get', `/api/classes/${B.id}/assessments`, token, undefined, [200])).body;

  const pre = { A: summariseWindow(preA.resultsRows as Row[]), B: preB ? summariseWindow(preB.resultsRows as Row[]) : null };
  const post = { A: summariseWindow(postA.resultsRows as Row[]), B: postB ? summariseWindow(postB.resultsRows as Row[]) : null };
  for (const cls of CLASSES) {
    const winPre = cls === A ? preA : preB;
    const winPost = cls === A ? postA : postB;
    for (const ch of cls.children) {
      const rp = (winPre.resultsRows as Row[]).find((r) => r.studentId === ch.studentId);
      const rq = (winPost.resultsRows as Row[]).find((r) => r.studentId === ch.studentId);
      ch.preMarks = rp?.total ?? undefined;
      ch.postMarks = rq?.total ?? undefined;
    }
  }

  const dir = OUT_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
    writeFileSync(join(dir, 'study.json'), JSON.stringify(studyDetail, null, 2));
    writeFileSync(join(dir, 'progress-5A.json'), JSON.stringify(progA, null, 2));
    writeFileSync(join(dir, 'progress-5B.json'), JSON.stringify(progB, null, 2));
    writeFileSync(join(dir, 'export-scores.csv'), scoresCsv);
    writeFileSync(join(dir, 'export-participation.csv'), partCsv);
    writeFileSync(join(dir, 'export-summary.csv'), summaryCsv);
    writeFileSync(join(dir, 'windows-5A.json'), JSON.stringify(windowsA, null, 2));
    writeFileSync(join(dir, 'windows-5B.json'), JSON.stringify(windowsB, null, 2));
    writeFileSync(join(dir, 'assessment-results.json'), JSON.stringify({ preA, preB, postA, postB }, null, 2));
  }

  const summary = {
    seed: SEED, databaseHost: dbHost, databaseName: new URL(DB_URL).pathname.slice(1), elapsedSec: Math.round((Date.now() - t0) / 1000),
    school: { id: school.schoolId, name: school.schoolName, studentCode: school.studentCode },
    teacher: { email: school.teacherEmail, password: TEACHER_PASSWORD, name: school.teacherName },
    principalEmail: school.principalEmail,
    studyId, studyName: STUDY_NAME, studyStart: STUDY_START, schoolDays: SCHOOL_DAYS, dates: STUDY_DATES, postDate: POST_DATE,
    classes: CLASSES.map((cls) => ({
      id: cls.id, name: cls.name, classCode: cls.classCode, group: cls.group,
      windows: { pre: (cls === A ? preA : preB).windowId, post: (cls === A ? postA : postB).windowId, preAccessCode: (cls === A ? preA : preB).accessCode, postAccessCode: (cls === A ? postA : postB).accessCode },
      children: cls.children.map((ch) => ({
        studentId: ch.studentId, rollNo: ch.rollNo, firstName: ch.firstName, pin: ch.pin, studyCode: ch.studyCode, ability: ch.ability,
        skipDays: [...ch.skipDays].sort((x, y) => x - y).map((d) => STUDY_DATES[d]), daysPlayed: ch.daysPlayed.length,
        sessionsCompleted: ch.sessionsCompleted, wordsCompleted: ch.wordsCompleted, practisedWords: ch.practised.size, recallAnswers: ch.recallAnswers,
        gate409: ch.gate409, preTotal: ch.preMarks ?? null, postTotal: ch.postMarks ?? null,
      })),
    })),
    pre, post, tallies, apiErrors, expectedGate409Count: expectedGate409.length,
    results: { counts: results.counts ?? null, groups: results.groups ?? null, participation: results.participation ?? null },
    progressSummary: { A: (progA.students ?? []).map((s: { firstName: string; daysCompleted: number; wordsCompleted: number }) => [s.firstName, s.daysCompleted, s.wordsCompleted]), B: (progB.students ?? []).length },
  };
  console.log('SIM_SUMMARY_BEGIN');
  console.log(JSON.stringify(summary, null, 2));
  console.log('SIM_SUMMARY_END');
  await db.end();
}

main().catch(async (e) => {
  console.error('[sim] FAILED in', currentDay, '-', (e as Error).stack ?? e);
  await db.end().catch(() => {});
  process.exitCode = 1;
});
