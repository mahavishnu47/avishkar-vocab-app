/**
 * F5 sentence authenticity signals: pure functions. Flags are "check" hints for the teacher, never penalties;
 * the child is never told. Spec: docs/RESEARCH_FEATURES.md F5.
 */
import { acceptedForms, jaccard, tokenize } from '../sentence.ts';

export const AUTH_THRESHOLDS = {
  exampleCopy: 0.6,
  exampleNear: 0.4,
  peerJaccard: 0.8,
  templateJaccard: 0.8,
  templateMinWords: 3,
  maxCharsPerSecond: 4,
  fastMinChars: 25,
  fastMinMs: 4000,
} as const;

export type AuthenticityFlag = 'example_copy' | 'example_near' | 'peer_match' | 'template' | 'typing' | 'starter';
export type ReviewStatus = 'ok' | 'not_own';
export type AuthenticityKind = 'daily' | 'test';

export const FLAG_LABELS: Record<AuthenticityFlag, string> = {
  example_copy: 'Same as the example',
  example_near: 'Very close to the example',
  peer_match: 'Matches a classmate',
  template: 'Same sentence frame again',
  typing: 'Typing looks unusual',
  starter: 'Used "Help me start"',
};

/** Lower-case word tokens joined by single spaces (punctuation, case and spacing ignored). */
export function normaliseSentence(text: string): string {
  return tokenize(text).join(' ');
}

/** Word tokens with every form of the target word replaced by "_" (the sentence "frame"). */
export function maskTarget(text: string, word: string, forms?: string[]): string[] {
  const accepted = new Set(acceptedForms(word, forms));
  return tokenize(text).map((t) => (accepted.has(t) ? '_' : t));
}

export function exampleSimilarity(text: string, example: string): number {
  const a = tokenize(text);
  const b = tokenize(example);
  if (a.length === 0 || b.length === 0) return 0;
  return jaccard(a, b);
}

export interface AuthSentence {
  id: string;
  studentId: number;
  /** Peer matching only compares sentences with the same groupKey (same word and same class/test window). */
  groupKey: string;
  /** Sort key for "earlier": ISO time (ties broken by position in the input). */
  at: string;
  text: string;
}

/** For each sentence, the earlier sentence of another student it matches (Jaccard >= 0.8). The earliest author is never flagged. */
export function findPeerMatches(items: AuthSentence[]): Map<string, string> {
  const out = new Map<string, string>();
  const order = items.map((it, idx) => ({ it, idx, toks: tokenize(it.text) }))
    .sort((a, b) => (a.it.at < b.it.at ? -1 : a.it.at > b.it.at ? 1 : a.idx - b.idx));
  const byGroup = new Map<string, typeof order>();
  for (const o of order) {
    if (o.toks.length === 0) continue;
    const seen = byGroup.get(o.it.groupKey) ?? [];
    const hit = seen.find((p) => p.it.studentId !== o.it.studentId && jaccard(p.toks, o.toks) >= AUTH_THRESHOLDS.peerJaccard);
    if (hit) out.set(o.it.id, hit.it.id);
    seen.push(o);
    byGroup.set(o.it.groupKey, seen);
  }
  return out;
}

export interface TemplateInput {
  id: string;
  studentId: number;
  /** One student's sentences are compared with each other inside the same scope (e.g. daily sentences, or one test window). */
  scope: string;
  wordKey: string;
  word: string;
  forms?: string[];
  text: string;
}

/** Sentence ids whose masked frame repeats (Jaccard >= 0.8) for at least 3 different words of the same student. */
export function findTemplates(items: TemplateInput[]): Set<string> {
  const out = new Set<string>();
  const prepared = items.map((it) => ({ it, frame: maskTarget(it.text, it.word, it.forms) }))
    .filter((p) => p.frame.length >= 2 && p.frame.includes('_'));
  const groups = new Map<string, typeof prepared>();
  for (const p of prepared) {
    const k = `${p.it.scope}|${p.it.studentId}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const list of groups.values()) {
    for (const p of list) {
      const words = new Set<string>();
      for (const q of list) if (jaccard(p.frame, q.frame) >= AUTH_THRESHOLDS.templateJaccard) words.add(q.it.wordKey);
      if (words.size >= AUTH_THRESHOLDS.templateMinWords) out.add(p.it.id);
    }
  }
  return out;
}

export type TypingReason = 'fewer_keys_than_chars' | 'too_fast' | 'too_quick';

/** Typing signals. keystrokes null/undefined means "not recorded": nothing is flagged on missing data. */
export function typingFlags(a: { chars: number; keystrokes?: number | null; msElapsed?: number | null }): TypingReason[] {
  const out: TypingReason[] = [];
  const { chars } = a;
  if (chars <= 0) return out;
  if (a.keystrokes != null && a.keystrokes < chars) out.push('fewer_keys_than_chars');
  const ms = a.msElapsed;
  if (ms != null && ms > 0) {
    if (chars / (ms / 1000) > AUTH_THRESHOLDS.maxCharsPerSecond) out.push('too_fast');
    if (chars >= AUTH_THRESHOLDS.fastMinChars && ms < AUTH_THRESHOLDS.fastMinMs) out.push('too_quick');
  }
  return out;
}

export interface FlagInput {
  text: string;
  example?: string | null;
  keystrokes?: number | null;
  msElapsed?: number | null;
  starterUsed?: boolean;
  peerMatch?: boolean;
  template?: boolean;
}

export function flagsFor(a: FlagInput): AuthenticityFlag[] {
  const out: AuthenticityFlag[] = [];
  if (a.example) {
    const s = exampleSimilarity(a.text, a.example);
    if (s >= AUTH_THRESHOLDS.exampleCopy) out.push('example_copy');
    else if (s >= AUTH_THRESHOLDS.exampleNear) out.push('example_near');
  }
  if (a.peerMatch) out.push('peer_match');
  if (a.template) out.push('template');
  if (typingFlags({ chars: a.text.trim().length, keystrokes: a.keystrokes, msElapsed: a.msElapsed }).length) out.push('typing');
  if (a.starterUsed) out.push('starter');
  return out;
}

/** The informational "starter" flag does not make a sentence "flagged". */
export const isCheckFlag = (f: AuthenticityFlag): boolean => f !== 'starter';

// ------------------------------------------------------------------ API types
export interface AuthenticityItem {
  kind: AuthenticityKind;
  id: number | string;
  studentId: number;
  rollNo: number;
  firstName: string;
  word: string;
  text: string;
  example: string | null;
  date: string;
  flags: AuthenticityFlag[];
  matchedFirstName: string | null;
  keystrokes: number | null;
  deletions: number | null;
  msElapsed: number | null;
  reviewStatus: ReviewStatus | null;
}
export interface AuthenticityStudentRow {
  studentId: number;
  rollNo: number;
  firstName: string;
  sentences: number;
  flagged: number;
  notOwn: number;
}
export interface AuthenticitySummary {
  sentences: number;
  noFlag: number;
  flagged: number;
  peerMatches: number;
  teacherConfirmedCopy: number;
  teacherConfirmedOwn: number;
  noFlagPct: number | null;
  ownWorkPct: number | null;
}
export interface AuthenticityRes {
  classId: number;
  from: string | null;
  to: string | null;
  summary: AuthenticitySummary;
  students: AuthenticityStudentRow[];
  items: AuthenticityItem[];
}
export interface ReviewAuthenticityReq { status: ReviewStatus | null }

// ------------------------------------------------------------------ client counting
export interface TypingCounts { keystrokes: number; deletions: number }

/** Update the counters after a text change: growth counts as keystrokes (one per added character), shrinkage as deletions. */
export function nextTypingCounts(c: TypingCounts, prevText: string, nextText: string): TypingCounts {
  const d = nextText.length - prevText.length;
  if (d > 0) return { keystrokes: c.keystrokes + d, deletions: c.deletions };
  if (d < 0) return { keystrokes: c.keystrokes, deletions: c.deletions - d };
  return c;
}
