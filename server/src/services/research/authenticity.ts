/**
 * F5 authenticity service: builds flagged-sentence lists from daily sentences and F4 section C answers.
 * Signals only: nothing here changes a score. Spec: docs/RESEARCH_FEATURES.md F5.
 * No new tables (columns live on sentence_submissions / assessment_responses), so F1 withdrawal already removes them.
 */
import type { AuthenticityItem, AuthenticityRes, AuthenticityStudentRow, AuthenticitySummary, AuthSentence, ReviewStatus, TemplateInput } from '@shabd/core';
import { findPeerMatches, findTemplates, flagsFor, isCheckFlag } from '@shabd/core';
import type { Queryable } from '../../db/db.ts';
import { allForms } from './assessment.ts';

interface Cand extends AuthSentence {
  kind: 'daily' | 'test';
  rawId: number | string;
  rollNo: number;
  firstName: string;
  word: string;
  forms: string[];
  example: string | null;
  date: string;
  keystrokes: number | null;
  deletions: number | null;
  msElapsed: number | null;
  starter: boolean;
  scope: string;
  reviewStatus: ReviewStatus | null;
}

const asStatus = (v: unknown): ReviewStatus | null => (v === 'ok' || v === 'not_own' ? v : null);

async function candidates(q: Queryable, classId: number): Promise<Cand[]> {
  const out: Cand[] = [];
  const daily = await q.all<Record<string, unknown>>(
    `SELECT ss.id, ss.student_id, ss.word_id, ss.text, ss.keystrokes, ss.deletions, ss.ms_elapsed, ss.hint_cost, ss.review_status, ss.server_ts,
            se.date, st.roll_no, st.first_name, w.word, w.example_sentence, w.forms_json
       FROM sentence_submissions ss
       JOIN sessions se ON se.id = ss.session_id
       JOIN students st ON st.id = ss.student_id
       JOIN words w ON w.id = ss.word_id
      WHERE se.class_id = ? AND st.class_id = ? AND ss.counted = 1
      ORDER BY ss.id`,
    [classId, classId],
  );
  for (const r of daily) {
    let forms: string[] = [];
    try { forms = JSON.parse(String(r.forms_json ?? '[]')) as string[]; } catch { /* ignore */ }
    out.push({
      id: `d${r.id}`, kind: 'daily', rawId: Number(r.id), studentId: Number(r.student_id), groupKey: `d:${r.word_id}`, at: String(r.server_ts),
      text: String(r.text), rollNo: Number(r.roll_no), firstName: String(r.first_name), word: String(r.word), forms,
      example: String(r.example_sentence), date: String(r.date),
      keystrokes: r.keystrokes == null ? null : Number(r.keystrokes), deletions: r.deletions == null ? null : Number(r.deletions),
      msElapsed: Number(r.ms_elapsed), starter: Number(r.hint_cost) > 0, scope: 'daily', reviewStatus: asStatus(r.review_status),
    });
  }
  const itemInfo = new Map<string, { word: string; example: string; forms: string[] }>();
  for (const f of allForms()) for (const c of f.sectionC) itemInfo.set(`${f.formId}:${c.id}`, { word: c.word, example: c.exampleSentence, forms: c.forms ?? [] });
  const tests = await q.all<Record<string, unknown>>(
    `SELECT r.attempt_id, r.item_id, r.answer, r.keystrokes, r.deletions, r.ms_elapsed, r.review_status, r.updated_at,
            a.student_id, a.started_at, w.id AS window_id, w.form_id, st.roll_no, st.first_name
       FROM assessment_responses r
       JOIN assessment_attempts a ON a.id = r.attempt_id
       JOIN assessment_windows w ON w.id = a.window_id
       JOIN students st ON st.id = a.student_id
      WHERE w.class_id = ? AND st.class_id = ? AND r.section = 'C' AND r.answer <> ''
      ORDER BY r.attempt_id, r.item_id`,
    [classId, classId],
  );
  for (const r of tests) {
    const info = itemInfo.get(`${r.form_id}:${r.item_id}`);
    if (!info) continue;
    const typed = Number(r.keystrokes) > 0 || Number(r.deletions) > 0; // 0/0 means "not recorded" (paper or old client)
    out.push({
      id: `t${r.attempt_id}:${r.item_id}`, kind: 'test', rawId: `${r.attempt_id}:${r.item_id}`, studentId: Number(r.student_id),
      groupKey: `t:${r.window_id}:${r.item_id}`, at: String(r.updated_at), text: String(r.answer), rollNo: Number(r.roll_no), firstName: String(r.first_name),
      word: info.word, forms: info.forms, example: info.example, date: String(r.started_at).slice(0, 10),
      keystrokes: typed ? Number(r.keystrokes) : null, deletions: typed ? Number(r.deletions) : null,
      msElapsed: typed ? Number(r.ms_elapsed) : null, starter: false, scope: `t:${r.window_id}`, reviewStatus: asStatus(r.review_status),
    });
  }
  return out;
}

interface Evaluated { c: Cand; flags: ReturnType<typeof flagsFor>; matched: string | null }

export async function evaluateClass(q: Queryable, classId: number): Promise<Evaluated[]> {
  const cands = await candidates(q, classId);
  const byId = new Map(cands.map((c) => [c.id, c]));
  const peers = findPeerMatches(cands);
  const templates = findTemplates(cands.map((c): TemplateInput => ({
    id: c.id, studentId: c.studentId, scope: c.scope, wordKey: c.word.toLowerCase(), word: c.word, forms: c.forms, text: c.text,
  })));
  return cands.map((c) => ({
    c,
    flags: flagsFor({
      text: c.text, example: c.example, keystrokes: c.keystrokes, msElapsed: c.msElapsed, starterUsed: c.starter,
      peerMatch: peers.has(c.id), template: templates.has(c.id),
    }),
    matched: peers.has(c.id) ? byId.get(peers.get(c.id)!)?.firstName ?? null : null,
  }));
}

const inRange = (date: string, from?: string | null, to?: string | null) => (!from || date >= from) && (!to || date <= to);
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

function summarise(list: Evaluated[]): AuthenticitySummary {
  const n = list.length;
  const flaggedOf = (e: Evaluated) => e.flags.some(isCheckFlag);
  const noFlag = list.filter((e) => !flaggedOf(e)).length;
  const notOwn = list.filter((e) => e.c.reviewStatus === 'not_own').length;
  const okReviewed = list.filter((e) => e.c.reviewStatus === 'ok').length;
  const clear = list.filter((e) => e.c.reviewStatus === 'ok' || (!flaggedOf(e) && e.c.reviewStatus !== 'not_own')).length;
  return {
    sentences: n, noFlag, flagged: n - noFlag, peerMatches: list.filter((e) => e.flags.includes('peer_match')).length,
    teacherConfirmedCopy: notOwn, teacherConfirmedOwn: okReviewed, noFlagPct: pct(noFlag, n), ownWorkPct: pct(clear, n),
  };
}

/** Class-level counts only (used by the F8 results dashboard / export): no names, no text. */
export async function authenticitySummary(q: Queryable, classIds: number[], from?: string | null, to?: string | null): Promise<AuthenticitySummary> {
  const all: Evaluated[] = [];
  for (const id of classIds) all.push(...(await evaluateClass(q, id)).filter((e) => inRange(e.c.date, from, to)));
  return summarise(all);
}

export async function classAuthenticity(q: Queryable, classId: number, from?: string | null, to?: string | null): Promise<AuthenticityRes> {
  const list = (await evaluateClass(q, classId)).filter((e) => inRange(e.c.date, from, to));
  const roster = await q.all<{ id: number; roll_no: number; first_name: string }>('SELECT id, roll_no, first_name FROM students WHERE class_id = ? ORDER BY roll_no', [classId]);
  const students: AuthenticityStudentRow[] = roster.map((s) => {
    const mine = list.filter((e) => e.c.studentId === s.id);
    return {
      studentId: s.id, rollNo: s.roll_no, firstName: s.first_name, sentences: mine.length,
      flagged: mine.filter((e) => e.flags.some(isCheckFlag)).length, notOwn: mine.filter((e) => e.c.reviewStatus === 'not_own').length,
    };
  });
  const items: AuthenticityItem[] = list.filter((e) => e.flags.some(isCheckFlag) || e.c.reviewStatus)
    .map((e) => ({
      kind: e.c.kind, id: e.c.rawId, studentId: e.c.studentId, rollNo: e.c.rollNo, firstName: e.c.firstName, word: e.c.word, text: e.c.text,
      example: e.c.example, date: e.c.date, flags: e.flags, matchedFirstName: e.matched, keystrokes: e.c.keystrokes, deletions: e.c.deletions,
      msElapsed: e.c.msElapsed, reviewStatus: e.c.reviewStatus,
    }))
    .sort((a, b) => (a.reviewStatus ? 1 : 0) - (b.reviewStatus ? 1 : 0) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { classId, from: from ?? null, to: to ?? null, summary: summarise(list), students, items };
}

/** Sets or clears a review. Returns false when the row is not in this class (caller answers 404). */
export async function reviewItem(q: Queryable, classId: number, kind: 'daily' | 'test', id: string, status: ReviewStatus | null, teacherId: number): Promise<boolean> {
  if (kind === 'daily') {
    if (!/^\d+$/.test(id)) return false;
    const r = await q.run(
      `UPDATE sentence_submissions SET review_status = ?, reviewed_by = ?
        WHERE id = ? AND counted = 1 AND student_id IN (SELECT id FROM students WHERE class_id = ?)`,
      [status, status ? teacherId : null, Number(id), classId],
    );
    return r.rowCount > 0;
  }
  const m = /^(\d+):([A-Za-z0-9_-]+)$/.exec(id);
  if (!m) return false;
  const r = await q.run(
    `UPDATE assessment_responses SET review_status = ?
      WHERE attempt_id = ? AND item_id = ? AND section = 'C'
        AND attempt_id IN (SELECT a.id FROM assessment_attempts a JOIN assessment_windows w ON w.id = a.window_id WHERE w.class_id = ?)`,
    [status, Number(m[1]), m[2], classId],
  );
  return r.rowCount > 0;
}
