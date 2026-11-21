/**
 * F8 results service: the central anonymisation point. Only consented, non-excluded students are read, and every
 * output identifies a child by study code only (never first name, roll number or sentence text).
 * Participation and completion are computed here from sessions, independent of the F7 tracker.
 */
import type {
  AuthenticityCounts, ComparisonRow, ExportType, GroupSummary, Participation, ResultCounts, ResultParticipant, ResultSection,
  ScoreSet, SectionChange, StudyGroup, StudyResultsRes, TTestRow,
} from '@shabd/core';
import {
  OBSERVATION_INDICATORS, RESULT_SECTIONS, isCheckFlag, mean, pairedTTest, pctImprovement, sd, studyDates, welchTTest,
} from '@shabd/core';
import { today } from '../../clock.ts';
import type { Queryable } from '../../db/db.ts';
import { notFound } from '../../http.ts';
import { assessmentScores } from './assessment.ts';
import { evaluateClass } from './authenticity.ts';
import { instrumentSummary } from './instruments.ts';

const round = (n: number | null, dp = 4): number | null => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);
const SEC_KEY: Record<ResultSection, keyof ScoreSet> = { A: 'a', B: 'b', C: 'c', total: 'total' };

interface Person {
  studentId: number;
  studyCode: string;
  group: StudyGroup;
  consent: string;
  excluded: boolean;
}

function countsOf(people: Person[], parts: ResultParticipant[], byCode: Map<string, Person>): ResultCounts {
  const analysable = parts.filter((p) => byCode.has(p.studyCode));
  return {
    enrolled: people.length,
    consented: people.filter((p) => p.consent === 'given').length,
    analysable: analysable.length,
    analysed: analysable.filter((p) => p.complete).length,
    missingPre: analysable.filter((p) => !p.pre).length,
    missingPost: analysable.filter((p) => !p.post).length,
  };
}

export async function buildResults(q: Queryable, studyId: number): Promise<StudyResultsRes> {
  const study = await q.get<{ id: number; name: string; status: 'setup' | 'running' | 'closed'; start_date: string; school_days: number }>(
    'SELECT id, name, status, start_date, school_days FROM studies WHERE id = ?', [studyId]);
  if (!study) throw notFound('Study not found');

  const classes = await q.all<{ class_id: number; grp: StudyGroup }>('SELECT class_id, grp FROM study_classes WHERE study_id = ? ORDER BY class_id', [studyId]);
  const people = (await q.all<{ student_id: number; study_code: string; consent: string; excluded: number; grp: StudyGroup }>(
    `SELECT p.student_id, p.study_code, p.consent, p.excluded, sc.grp
       FROM study_participants p
       JOIN students st ON st.id = p.student_id
       JOIN study_classes sc ON sc.study_id = p.study_id AND sc.class_id = st.class_id
      WHERE p.study_id = ? ORDER BY sc.grp DESC, p.study_code`, [studyId]))
    .map((r): Person => ({ studentId: r.student_id, studyCode: r.study_code, group: r.grp, consent: r.consent, excluded: Number(r.excluded) === 1 }));
  const analysable = people.filter((p) => p.consent === 'given' && !p.excluded);
  const byId = new Map(analysable.map((p) => [p.studentId, p]));
  const byCode = new Map(analysable.map((p) => [p.studyCode, p]));

  // ---- scores (F4): pre and post per analysable student
  const pre = new Map<number, ScoreSet>();
  const post = new Map<number, ScoreSet>();
  for (const c of classes) {
    for (const r of await assessmentScores(q, c.class_id)) {
      if (!byId.has(r.studentId) || !r.complete) continue;
      (r.kind === 'pre' ? pre : post).set(r.studentId, { a: r.a, b: r.b, c: r.c, total: r.total });
    }
  }

  // ---- participation: study days elapsed, sessions completed per analysable intervention student
  const holidays = (await q.all<{ date: string }>('SELECT date FROM study_holidays WHERE study_id = ? ORDER BY date', [studyId])).map((r) => r.date);
  const allDates = studyDates(study.start_date, holidays, study.school_days);
  const elapsed = allDates.filter((d) => d <= today());
  const interv = analysable.filter((p) => p.group === 'intervention');
  const done = new Map<number, Set<string>>();
  if (interv.length > 0 && elapsed.length > 0) {
    const rows = await q.all<{ student_id: number; date: string }>(
      'SELECT student_id, date FROM sessions WHERE completed_at IS NOT NULL AND student_id = ANY(?::int[]) AND date >= ? AND date <= ?',
      [interv.map((p) => p.studentId), elapsed[0], elapsed[elapsed.length - 1]]);
    const valid = new Set(elapsed);
    for (const r of rows) {
      if (!valid.has(r.date)) continue;
      if (!done.has(r.student_id)) done.set(r.student_id, new Set());
      done.get(r.student_id)!.add(r.date);
    }
  }

  const participants: ResultParticipant[] = analysable.map((p): ResultParticipant => {
    const a = pre.get(p.studentId) ?? null;
    const b = post.get(p.studentId) ?? null;
    let change: Record<ResultSection, SectionChange> | null = null;
    if (a && b) {
      change = {} as Record<ResultSection, SectionChange>;
      for (const s of RESULT_SECTIONS) {
        const k = SEC_KEY[s];
        change[s] = { pre: a[k], post: b[k], gain: b[k] - a[k], pctGain: round(pctImprovement(a[k], b[k]), 2) };
      }
    }
    const isInt = p.group === 'intervention';
    const days = isInt ? (done.get(p.studentId)?.size ?? 0) : null;
    return {
      studyCode: p.studyCode, group: p.group, pre: a, post: b, complete: !!(a && b), change,
      daysCompleted: days, completionRate: isInt && elapsed.length > 0 ? round(days! / elapsed.length, 4) : null,
    };
  });

  const groups = (['intervention', 'comparison'] as StudyGroup[]).filter((g) => people.some((p) => p.group === g));
  const groupCounts = groups.map((g) => ({
    group: g,
    counts: countsOf(people.filter((p) => p.group === g), participants.filter((p) => p.group === g), byCode),
  }));
  const counts = countsOf(people, participants, byCode);

  // ---- summary, paired tests, comparison
  const summary: GroupSummary[] = [];
  const tTests: TTestRow[] = [];
  const gainsOf = (g: StudyGroup, s: ResultSection) => participants.filter((p) => p.group === g && p.change).map((p) => p.change![s].gain);
  for (const g of groups) {
    if (!participants.some((p) => p.group === g)) continue;
    const done2 = participants.filter((p) => p.group === g && p.complete);
    for (const s of RESULT_SECTIONS) {
      const k = SEC_KEY[s];
      const xs = done2.map((p) => p.pre![k]);
      const ys = done2.map((p) => p.post![k]);
      const gains = gainsOf(g, s);
      summary.push({
        group: g, section: s, n: done2.length,
        meanPre: round(mean(xs)), sdPre: round(sd(xs)), meanPost: round(mean(ys)), sdPost: round(sd(ys)),
        meanGain: round(mean(gains)), sdGain: round(sd(gains)), pctImprovement: round(pctImprovement(mean(xs), mean(ys)), 2),
      });
      tTests.push({ group: g, section: s, n: done2.length, test: pairedTTest(xs, ys) });
    }
  }
  let comparison: ComparisonRow[] | null = null;
  if (gainsOf('intervention', 'total').length > 0 && gainsOf('comparison', 'total').length > 0) {
    comparison = RESULT_SECTIONS.map((s): ComparisonRow => {
      const gi = gainsOf('intervention', s);
      const gc = gainsOf('comparison', s);
      return {
        section: s,
        intervention: { n: gi.length, meanGain: round(mean(gi)), sdGain: round(sd(gi)) },
        comparison: { n: gc.length, meanGain: round(mean(gc)), sdGain: round(sd(gc)) },
        welch: welchTTest(gi, gc),
      };
    });
  }

  const participation: Participation = {
    studyDaysElapsed: elapsed.length,
    schoolDays: study.school_days,
    days: elapsed.map((date, i) => {
      const completed = interv.filter((p) => done.get(p.studentId)?.has(date)).length;
      return { dayNo: i + 1, date, completed, of: interv.length, pct: interv.length ? round((completed / interv.length) * 100, 1) : null };
    }),
    meanCompletionRate: round(mean(participants.filter((p) => p.completionRate !== null).map((p) => p.completionRate!)), 4),
  };

  // ---- optional sections
  let authenticity: AuthenticityCounts | null = null;
  const evaluated = [];
  for (const c of classes) evaluated.push(...(await evaluateClass(q, c.class_id)).filter((e) => byId.has(e.c.studentId)));
  if (evaluated.length > 0) {
    const flagged = evaluated.filter((e) => e.flags.some(isCheckFlag)).length;
    authenticity = {
      sentences: evaluated.length, flagged, noFlag: evaluated.length - flagged,
      teacherConfirmedCopy: evaluated.filter((e) => e.c.reviewStatus === 'not_own').length,
      noFlagPct: round(((evaluated.length - flagged) / evaluated.length) * 100, 1),
    };
  }
  const inst = await instrumentSummary(q, studyId);
  return {
    studyId, name: study.name, status: study.status, generatedOn: today(),
    hasComparison: classes.some((c) => c.grp === 'comparison'),
    counts, groupCounts, participants, summary, tTests, comparison, participation, authenticity,
    observations: inst.observation.weeks.length > 0 ? inst.observation : null,
    feedback: inst.feedback.respondents > 0 ? inst.feedback : null,
  };
}

// ------------------------------------------------------------------ CSV

type Cell = string | number | null | undefined;
interface Table { name: string; header: string[]; rows: Cell[][] }

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const line = (cells: Cell[]) => cells.map(csvCell).join(',');

function render(tables: Table[], titled: boolean): string {
  const parts = tables.map((t) => [...(titled ? [line([`# ${t.name}`])] : []), line(t.header), ...t.rows.map(line)].join('\r\n'));
  return '﻿' + parts.join('\r\n\r\n') + '\r\n';
}

const r2 = (n: number | null | undefined) => (n === null || n === undefined ? null : round(n, 3));

function tables(res: StudyResultsRes): Record<Exclude<ExportType, 'pack'>, Table[]> {
  const scores: Table = {
    name: 'scores',
    header: ['study_code', 'group', 'pre_A', 'pre_B', 'pre_C', 'pre_total', 'post_A', 'post_B', 'post_C', 'post_total', 'gain_A', 'gain_B', 'gain_C', 'gain_total', 'pct_gain_total', 'complete'],
    rows: res.participants.map((p) => [
      p.studyCode, p.group, p.pre?.a, p.pre?.b, p.pre?.c, p.pre?.total, p.post?.a, p.post?.b, p.post?.c, p.post?.total,
      p.change?.A.gain, p.change?.B.gain, p.change?.C.gain, p.change?.total.gain, p.change?.total.pctGain, p.complete ? 1 : 0,
    ]),
  };
  const summary: Table = {
    name: 'summary_statistics',
    header: ['group', 'section', 'n', 'mean_pre', 'sd_pre', 'mean_post', 'sd_post', 'mean_gain', 'sd_gain', 'pct_improvement', 't', 'df', 'p_two_tailed', 'ci95_low', 'ci95_high', 'cohen_dz'],
    rows: res.summary.map((s) => {
      const t = res.tTests.find((x) => x.group === s.group && x.section === s.section)?.test;
      return [s.group, s.section, s.n, r2(s.meanPre), r2(s.sdPre), r2(s.meanPost), r2(s.sdPost), r2(s.meanGain), r2(s.sdGain), r2(s.pctImprovement),
        r2(t?.t), t?.df, t ? Number(t.p.toPrecision(4)) : null, r2(t?.ci95[0]), r2(t?.ci95[1]), r2(t?.cohenDz)];
    }),
  };
  const comparison: Table = {
    name: 'comparison_group_welch',
    header: ['section', 'n_intervention', 'mean_gain_intervention', 'sd_gain_intervention', 'n_comparison', 'mean_gain_comparison', 'sd_gain_comparison', 't', 'df', 'p_two_tailed', 'ci95_low', 'ci95_high'],
    rows: (res.comparison ?? []).map((c) => [c.section, c.intervention.n, r2(c.intervention.meanGain), r2(c.intervention.sdGain), c.comparison.n, r2(c.comparison.meanGain),
      r2(c.comparison.sdGain), r2(c.welch?.t), r2(c.welch?.df), c.welch ? Number(c.welch.p.toPrecision(4)) : null, r2(c.welch?.ci95[0]), r2(c.welch?.ci95[1])]),
  };
  const perDay: Table = {
    name: 'participation_by_day',
    header: ['study_day', 'date', 'completed', 'of', 'pct'],
    rows: res.participation.days.map((d) => [d.dayNo, d.date, d.completed, d.of, d.pct]),
  };
  const perStudent: Table = {
    name: 'participation_by_student',
    header: ['study_code', 'days_completed', 'study_days_elapsed', 'completion_rate'],
    rows: res.participants.filter((p) => p.daysCompleted !== null).map((p) => [p.studyCode, p.daysCompleted, res.participation.studyDaysElapsed, p.completionRate]),
  };
  const feedback: Table = {
    name: 'feedback_summary',
    header: ['item_no', 'statement', 'yes', 'to_some_extent', 'no', 'n', 'pct_yes', 'pct_some', 'pct_no'],
    rows: (res.feedback?.items ?? []).map((i) => [i.itemNo, i.text, i.yes, i.some, i.no, i.n, i.pctYes, i.pctSome, i.pctNo]),
  };
  const labels = new Map(OBSERVATION_INDICATORS.map((i) => [i.key, i.label]));
  const observations: Table = {
    name: 'observation_summary',
    header: ['week', 'indicator', 'yes', 'no', 'not_observed'],
    rows: (res.observations?.weeks ?? []).flatMap((w) => w.indicators.map((i) => [w.week, labels.get(i.key) ?? i.label, i.yes, i.no, i.notObserved])),
  };
  const authenticity: Table = {
    name: 'authenticity_counts',
    header: ['sentences', 'no_flag', 'flagged', 'teacher_confirmed_copy', 'no_flag_pct'],
    rows: res.authenticity ? [[res.authenticity.sentences, res.authenticity.noFlag, res.authenticity.flagged, res.authenticity.teacherConfirmedCopy, res.authenticity.noFlagPct]] : [],
  };
  const sample: Table = {
    name: 'sample',
    header: ['group', 'enrolled', 'consented', 'analysable', 'analysed', 'missing_pre', 'missing_post'],
    rows: [['all', ...Object.values(res.counts)] as Cell[], ...res.groupCounts.map((g) => [g.group, ...Object.values(g.counts)] as Cell[])],
  };
  return {
    scores: [scores],
    summary: [sample, summary, comparison],
    participation: [perDay, perStudent],
    feedback: [feedback],
    observations: [observations],
    authenticity: [authenticity],
  };
}

/** One CSV. type 'pack' = every non-empty table as a titled section; other types = just that table(s), header-only when empty. */
export function buildExport(res: StudyResultsRes, type: ExportType): string {
  const all = tables(res);
  if (type === 'pack') {
    const order = ['summary', 'scores', 'participation', 'feedback', 'observations', 'authenticity'] as const;
    const picked = order.flatMap((k) => all[k]).filter((t) => t.rows.length > 0);
    return render([{ name: 'study', header: ['study_id', 'study_name', 'status', 'generated_on', 'anonymised'], rows: [[res.studyId, res.name, res.status, res.generatedOn, 'study codes only']] }, ...picked], true);
  }
  const list = all[type];
  const nonEmpty = list.filter((t) => t.rows.length > 0);
  return render(nonEmpty.length > 0 ? nonEmpty : [list[0]!], nonEmpty.length > 1);
}
