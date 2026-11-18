/** Pure helpers + state shape for the /play runner (unit-tested where it matters). */
import type {
  PartOfSpeech, SentenceEvaluation, SessionSummaryRes, SpellingHint, WordScore, Word,
} from '@shabd/core';
import type { WordRec } from './safe-core.ts';

export type Stage = 'spell' | 'learn' | 'check' | 'write' | 'summary';

export interface SubRec { evaluation: SentenceEvaluation; counted: boolean; finalMarks: number | null; pending?: boolean }

export interface PlayState {
  v: 1;
  sessionId: number;
  wordIdx: number;
  stage: Stage;
  spell: { wrong: number; hints: SpellingHint[]; audioPlays: number; input: string; last: string; copy: boolean; done: boolean; t0: number };
  meaning: { wrongTaps: string[]; done: boolean };
  sentence: { text: string; starter: boolean; counted: number; shown: SubRec | null; t0: number };
  recs: Record<string, WordRec>;
  localScores: WordScore[];
  sessionEnqueued?: boolean;
  summary?: SessionSummaryRes | null;
  summaryLocal?: boolean;
}

export function freshWord(): Pick<PlayState, 'spell' | 'meaning' | 'sentence'> {
  const t0 = Date.now();
  return {
    spell: { wrong: 0, hints: [], audioPlays: 0, input: '', last: '', copy: false, done: false, t0 },
    meaning: { wrongTaps: [], done: false },
    sentence: { text: '', starter: false, counted: 0, shown: null, t0 },
  };
}

export function freshState(sessionId: number, wordIdx: number): PlayState {
  return { v: 1, sessionId, wordIdx, stage: wordIdx >= 5 ? 'summary' : 'spell', ...freshWord(), recs: {}, localScores: [] };
}

export function emptyRec(): WordRec { return { correctOn: null, hints: [], meaningOn: null, subs: [] }; }

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic shuffle (mulberry32) so the order is stable across resume. */
export function seededShuffle<T>(arr: readonly T[], seedStr: string): T[] {
  let a = hash(seedStr);
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function starterFor(pos: PartOfSpeech, w: string): string {
  switch (pos) {
    case 'noun': return `I saw a ${w}`;
    case 'verb': return `Every day I ${w}`;
    case 'adjective': return `The ${w}`;
    case 'adverb': return `She walked ${w}`;
    default: return `I ${w}`;
  }
}

/** Split a sentence into [text, isTarget] parts, highlighting the word or an inflection of it. */
export function highlightParts(sentence: string, word: Word | { word: string; forms?: string[] }): [string, boolean][] {
  const stems = [word.word, ...(word.forms ?? [])].filter(Boolean).map((s) => s.toLowerCase());
  const stem = word.word.toLowerCase();
  const root = stem.length > 4 ? stem.slice(0, -1) : stem;
  const parts: [string, boolean][] = [];
  for (const tok of sentence.split(/(\b[A-Za-z']+\b)/)) {
    if (!tok) continue;
    const l = tok.toLowerCase();
    parts.push([tok, /^[a-z']+$/.test(l) && (stems.includes(l) || l.startsWith(root))]);
  }
  return parts;
}

export function wordIdxFromProgress(words: Word[], completed: string[]): number {
  const done = new Set(completed);
  const i = words.findIndex((w) => !done.has(w.id));
  return i === -1 ? words.length : i;
}

export const PRAISE = ['Super!', 'Well done!', 'You got it!', 'Great job!', 'Brilliant!'];
export function praise(n: number): string { return PRAISE[n % PRAISE.length]; }

export function uuid(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}
