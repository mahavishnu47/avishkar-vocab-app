/**
 * F8 teacher page. Routes (under /teacher/study/:studyId/results/*): "" = dashboard, "report" = printable A4 report.
 * Charts are inline SVG (no chart library) with value labels and grey/blue fills so they print well in black and white.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ExportType, GroupSummary, ResultParticipant, ResultSection, StudyResultsRes, TTestRow } from '@shabd/core';
import { RESULT_SECTION_LABEL, formatP, interpretP } from '@shabd/core';
import { resultsApi } from '../../shared/research/results-api.ts';
import { downloadCsv } from '../util.ts';
import { errMsg, Page, useLoad } from '../ui.tsx';

const PRE = '#6b7280';
const POST = '#1d4ed8';

export const fmt = (n: number | null | undefined, dp = 1): string => (n === null || n === undefined || Number.isNaN(n) ? '–' : n.toFixed(dp));
const pctFmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n.toFixed(1)}%`);

export default function Results() {
  const studyId = Number(useParams().studyId);
  const sub = useParams()['*'];
  const { data, error, loading } = useLoad(() => resultsApi.results(studyId), [studyId]);
  const report = sub === 'report';
  return (
    <Page title={report ? 'Study report' : 'Study results'} loading={loading} error={error}>
      <div className="row no-print" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn" to={`/teacher/study/${studyId}`}>Back to study</Link>
        {report
          ? <><Link className="btn" to={`/teacher/study/${studyId}/results`}>Back to results</Link><button className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button></>
          : <Link className="btn" to={`/teacher/study/${studyId}/results/report`}>Printable report</Link>}
      </div>
      {data && (report ? <Report res={data} /> : <Dashboard res={data} />)}
    </Page>
  );
}

// ------------------------------------------------------------------ data helpers

const interv = (res: StudyResultsRes) => res.summary.filter((s) => s.group === 'intervention');
const totalOf = (rows: GroupSummary[]) => rows.find((s) => s.section === 'total');
const testOf = (res: StudyResultsRes, group: 'intervention' | 'comparison', section: ResultSection): TTestRow | undefined =>
  res.tTests.find((t) => t.group === group && t.section === section);
const completeOf = (res: StudyResultsRes, group = 'intervention') => res.participants.filter((p) => p.group === group && p.complete);

// ------------------------------------------------------------------ dashboard

function Dashboard({ res }: { res: StudyResultsRes }) {
  const [msg, setMsg] = useState<string | null>(null);
  const dl = async (type: ExportType) => {
    setMsg(null);
    try { await downloadCsv(resultsApi.exportPath(res.studyId, type), `study-${res.studyId}-${type}.csv`); } catch (e) { setMsg(errMsg(e)); }
  };
  return (
    <>
      <Tiles res={res} />
      <section className="card stack no-print">
        <h2 className="t-h2">Research export</h2>
        <p className="muted">Files use study codes only (no names, roll numbers or sentences). Only children with consent who are not excluded are included.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => void dl('pack')}>Download research pack</button>
          {(['scores', 'summary', 'participation', 'feedback', 'observations', 'authenticity'] as ExportType[]).map((t) => (
            <button key={t} className="btn" onClick={() => void dl(t)}>{t[0]!.toUpperCase() + t.slice(1)} CSV</button>
          ))}
        </div>
        {msg && <div className="t-error" role="alert">{msg}</div>}
      </section>
      <Body res={res} />
    </>
  );
}

function Tiles({ res }: { res: StudyResultsRes }) {
  const s = totalOf(interv(res));
  const t = testOf(res, 'intervention', 'total')?.test ?? null;
  const c = res.counts;
  const tiles: [string, string, string?][] = [
    ['Students analysed', String(s?.n ?? 0), `${c.analysable} consented · ${c.enrolled} enrolled`],
    ['Mean pre-test', fmt(s?.meanPre), 'out of 30'],
    ['Mean post-test', fmt(s?.meanPost), 'out of 30'],
    ['Mean improvement', fmt(s?.meanGain), s?.sdGain != null ? `SD ${fmt(s.sdGain, 2)}` : undefined],
    ['Improvement', pctFmt(s?.pctImprovement), 'of the pre-test mean'],
    ['p-value', t ? formatP(t.p) : '–', t ? `t(${t.df}) = ${fmt(t.t, 2)}` : 'paired t-test'],
  ];
  return (
    <section aria-label="Key results" className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="card" role="group" aria-label={label} style={{ breakInside: 'avoid' }}>
            <div className="muted" style={{ fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
            {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
          </div>
        ))}
      </div>
      {res.counts.analysable > 0 && (
        <p className="muted" role="status">
          {c.analysed} of {c.analysable} analysable students have both tests
          {c.missingPre + c.missingPost > 0 && ` (missing pre-test: ${c.missingPre}, missing post-test: ${c.missingPost})`}.
        </p>
      )}
    </section>
  );
}

/** Everything below the tiles; shared by the dashboard and the printable report. */
function Body({ res }: { res: StudyResultsRes }) {
  const rows = interv(res);
  const done = completeOf(res);
  const total = testOf(res, 'intervention', 'total')?.test ?? null;
  return (
    <>
      <section className="card stack" style={{ breakInside: 'avoid' }}>
        <h2 className="t-h2">Pre-test vs post-test by skill</h2>
        {done.length === 0 ? <p className="muted">No students have both tests yet.</p> : <PrePostBars rows={rows} />}
      </section>
      {done.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8 }}>
          <section className="card stack" style={{ breakInside: 'avoid' }}>
            <h2 className="t-h2">Each student, pre to post</h2>
            <SlopeChart people={done} />
          </section>
          <section className="card stack" style={{ breakInside: 'avoid' }}>
            <h2 className="t-h2">Gains (post minus pre)</h2>
            <GainHistogram gains={done.map((p) => p.change!.total.gain)} />
          </section>
        </div>
      )}
      <section className="card stack" style={{ breakInside: 'avoid' }}>
        <h2 className="t-h2">Statistics by skill</h2>
        <StatsTable res={res} group="intervention" />
        <p>{interpretP(total?.p, total?.meanDiff)}</p>
        {total && <p className="muted">Mean gain {fmt(total.meanDiff, 2)} points, 95% confidence interval {fmt(total.ci95[0], 2)} to {fmt(total.ci95[1], 2)}; effect size (Cohen&apos;s d<sub>z</sub>) {fmt(total.cohenDz, 2)}.</p>}
      </section>
      {res.comparison && <Comparison res={res} />}
      <Participation res={res} />
      <Optional res={res} />
    </>
  );
}

function StatsTable({ res, group }: { res: StudyResultsRes; group: 'intervention' | 'comparison' }) {
  const sums = res.summary.filter((s) => s.group === group);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="t-table" aria-label={`Statistics by skill, ${group} group`}>
        <thead>
          <tr><th>Skill</th><th>n</th><th>Pre mean (SD)</th><th>Post mean (SD)</th><th>Mean gain</th><th>% improvement</th><th>t</th><th>df</th><th>p</th><th>d</th></tr>
        </thead>
        <tbody>
          {sums.map((s) => {
            const t = testOf(res, group, s.section)?.test ?? null;
            return (
              <tr key={s.section}>
                <td>{RESULT_SECTION_LABEL[s.section]}</td><td>{s.n}</td>
                <td>{fmt(s.meanPre, 2)} ({fmt(s.sdPre, 2)})</td><td>{fmt(s.meanPost, 2)} ({fmt(s.sdPost, 2)})</td>
                <td>{fmt(s.meanGain, 2)}</td><td>{pctFmt(s.pctImprovement)}</td>
                <td>{fmt(t?.t, 2)}</td><td>{t?.df ?? '–'}</td><td>{t ? formatP(t.p).replace('p ', '') : '–'}</td><td>{fmt(t?.cohenDz, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Comparison({ res }: { res: StudyResultsRes }) {
  return (
    <section className="card stack" style={{ breakInside: 'avoid' }}>
      <h2 className="t-h2">Intervention vs comparison group</h2>
      <p className="muted">Gains (post minus pre) compared with Welch&apos;s t-test.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="t-table" aria-label="Comparison of gains">
          <thead><tr><th>Skill</th><th>Intervention n</th><th>Mean gain</th><th>Comparison n</th><th>Mean gain</th><th>Difference</th><th>t</th><th>df</th><th>p</th></tr></thead>
          <tbody>
            {res.comparison!.map((c) => (
              <tr key={c.section}>
                <td>{RESULT_SECTION_LABEL[c.section]}</td><td>{c.intervention.n}</td><td>{fmt(c.intervention.meanGain, 2)}</td>
                <td>{c.comparison.n}</td><td>{fmt(c.comparison.meanGain, 2)}</td>
                <td>{fmt(c.welch?.meanDiff, 2)}</td><td>{fmt(c.welch?.t, 2)}</td><td>{fmt(c.welch?.df, 1)}</td><td>{c.welch ? formatP(c.welch.p).replace('p ', '') : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{interpretP(res.comparison!.find((c) => c.section === 'total')?.welch?.p, res.comparison!.find((c) => c.section === 'total')?.welch?.meanDiff)}</p>
    </section>
  );
}

function Participation({ res }: { res: StudyResultsRes }) {
  const p = res.participation;
  if (p.studyDaysElapsed === 0) return null;
  return (
    <section className="card stack" style={{ breakInside: 'avoid' }}>
      <h2 className="t-h2">Participation</h2>
      <p>
        Study days so far: {p.studyDaysElapsed} of {p.schoolDays}.{' '}
        {p.meanCompletionRate !== null && <>On average each student completed {pctFmt(p.meanCompletionRate * 100)} of the daily sets.</>}
      </p>
      <DayBars days={p.days} />
    </section>
  );
}

function Optional({ res }: { res: StudyResultsRes }) {
  const { feedback, observations, authenticity } = res;
  if (!feedback && !observations && !authenticity) return null;
  return (
    <>
      {feedback && (
        <section className="card stack" style={{ breakInside: 'avoid' }}>
          <h2 className="t-h2">Student feedback ({feedback.respondents} answered)</h2>
          <table className="t-table" aria-label="Feedback summary">
            <thead><tr><th>Statement</th><th>Yes</th><th>To some extent</th><th>No</th></tr></thead>
            <tbody>{feedback.items.map((i) => <tr key={i.itemNo}><td>{i.text}</td><td>{pctFmt(i.pctYes)}</td><td>{pctFmt(i.pctSome)}</td><td>{pctFmt(i.pctNo)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {observations && (
        <section className="card stack" style={{ breakInside: 'avoid' }}>
          <h2 className="t-h2">Teacher observation (yes counts)</h2>
          <table className="t-table" aria-label="Observation summary">
            <thead><tr><th>Week</th>{observations.weeks[0]!.indicators.map((i) => <th key={i.key}>{i.label}</th>)}</tr></thead>
            <tbody>{observations.weeks.map((w) => <tr key={w.week}><td>{w.week}</td>{w.indicators.map((i) => <td key={i.key}>{i.yes}</td>)}</tr>)}</tbody>
          </table>
        </section>
      )}
      {authenticity && (
        <section className="card stack" style={{ breakInside: 'avoid' }}>
          <h2 className="t-h2">Sentence authenticity</h2>
          <p>{authenticity.sentences} sentences checked: {authenticity.noFlag} with no flag ({pctFmt(authenticity.noFlagPct)}), {authenticity.flagged} flagged for a check, {authenticity.teacherConfirmedCopy} confirmed as not the child&apos;s own.</p>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ printable report

function Report({ res }: { res: StudyResultsRes }) {
  return (
    <article className="stack results-report" aria-label="Study report">
      <style>{`@media print { @page { size: A4; margin: 12mm; } .results-report { font-size: 11pt; color: #000; } .results-report .card { box-shadow: none; border: 1px solid #999; } .results-report svg { max-width: 100%; height: auto; } .t-nav, .no-print { display: none !important; } }`}</style>
      <h1 className="title">{res.name}: results report</h1>
      <p className="muted">Generated {res.generatedOn}. Children are identified by study code only. Analysed sample: {res.counts.analysed} students (enrolled {res.counts.enrolled}, consented {res.counts.consented}, analysable {res.counts.analysable}).</p>
      <Tiles res={res} />
      <Body res={res} />
    </article>
  );
}

// ------------------------------------------------------------------ charts (inline SVG)

function PrePostBars({ rows }: { rows: GroupSummary[] }) {
  const sections: ResultSection[] = ['A', 'B', 'C'];
  const W = 560; const H = 260; const L = 40; const B = 40; const T = 16;
  const plotH = H - B - T; const slot = (W - L - 10) / sections.length; const bw = 36;
  const y = (v: number) => T + plotH - (v / 10) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pre-test and post-test mean score for each skill" style={{ width: '100%', maxWidth: 640 }}>
      <title>Pre-test and post-test mean score for each skill (out of 10)</title>
      {[0, 2, 4, 6, 8, 10].map((v) => (
        <g key={v}><line x1={L} x2={W - 10} y1={y(v)} y2={y(v)} stroke="#d1d5db" strokeWidth={1} /><text x={L - 6} y={y(v) + 4} fontSize={11} textAnchor="end" fill="#374151">{v}</text></g>
      ))}
      {sections.map((s, i) => {
        const row = rows.find((r) => r.section === s);
        const x0 = L + i * slot + slot / 2;
        const bars: [number | null, string, string, number][] = [[row?.meanPre ?? null, PRE, 'Pre', -bw - 2], [row?.meanPost ?? null, POST, 'Post', 2]];
        return (
          <g key={s}>
            {bars.map(([v, fill, name, dx]) => v === null ? null : (
              <g key={name}>
                <rect x={x0 + dx} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} fill={fill} stroke="#000" strokeWidth={0.5}><title>{`${name} ${RESULT_SECTION_LABEL[s]}: ${fmt(v, 2)}`}</title></rect>
                <text x={x0 + dx + bw / 2} y={y(v) - 4} fontSize={11} textAnchor="middle" fill="#111827">{fmt(v, 1)}</text>
              </g>
            ))}
            <text x={x0} y={H - 20} fontSize={12} textAnchor="middle" fill="#111827">{RESULT_SECTION_LABEL[s]}</text>
          </g>
        );
      })}
      <g fontSize={12}>
        <rect x={W - 130} y={2} width={10} height={10} fill={PRE} /><text x={W - 116} y={11}>Pre</text>
        <rect x={W - 80} y={2} width={10} height={10} fill={POST} /><text x={W - 66} y={11}>Post</text>
      </g>
    </svg>
  );
}

function SlopeChart({ people }: { people: ResultParticipant[] }) {
  const W = 320; const H = 260; const L = 36; const R = 20; const T = 18; const B = 30;
  const y = (v: number) => T + (H - T - B) * (1 - v / 30);
  const x0 = L + 30; const x1 = W - R - 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Each student's total score before and after" style={{ width: '100%', maxWidth: 420 }}>
      <title>Each student&apos;s total score (out of 30) in the pre-test and the post-test</title>
      {[0, 10, 20, 30].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#d1d5db" /><text x={L - 5} y={y(v) + 4} fontSize={11} textAnchor="end" fill="#374151">{v}</text></g>)}
      {people.map((p) => {
        const up = p.change!.total.gain >= 0;
        return (
          <line key={p.studyCode} x1={x0} y1={y(p.pre!.total)} x2={x1} y2={y(p.post!.total)} stroke={up ? POST : '#b91c1c'} strokeWidth={1.5} strokeDasharray={up ? undefined : '4 3'} opacity={0.8}>
            <title>{`${p.studyCode}: ${p.pre!.total} to ${p.post!.total}`}</title>
          </line>
        );
      })}
      <text x={x0} y={H - 10} fontSize={12} textAnchor="middle">Pre</text>
      <text x={x1} y={H - 10} fontSize={12} textAnchor="middle">Post</text>
    </svg>
  );
}

function GainHistogram({ gains }: { gains: number[] }) {
  const min = Math.min(...gains); const max = Math.max(...gains);
  const width = Math.max(1, Math.ceil((max - min + 1) / 10));
  const start = Math.floor(min / width) * width;
  const bins: { lo: number; n: number }[] = [];
  for (let lo = start; lo <= max; lo += width) bins.push({ lo, n: gains.filter((g) => g >= lo && g < lo + width).length });
  const top = Math.max(...bins.map((b) => b.n), 1);
  const W = 320; const H = 260; const L = 34; const T = 18; const B = 36;
  const bw = (W - L - 12) / bins.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histogram of total score gains" style={{ width: '100%', maxWidth: 420 }}>
      <title>How many students gained each number of points between the pre-test and the post-test</title>
      {Array.from({ length: top + 1 }, (_, v) => v).filter((v) => top <= 6 || v % 2 === 0).map((v) => (
        <g key={v}><line x1={L} x2={W - 12} y1={y(v)} y2={y(v)} stroke="#d1d5db" /><text x={L - 5} y={y(v) + 4} fontSize={11} textAnchor="end" fill="#374151">{v}</text></g>
      ))}
      {bins.map((b, i) => (
        <g key={b.lo}>
          <rect x={L + i * bw + 2} y={y(b.n)} width={bw - 4} height={Math.max(0, y(0) - y(b.n))} fill={b.lo < 0 ? '#b91c1c' : POST} stroke="#000" strokeWidth={0.5}><title>{`${b.n} student(s)`}</title></rect>
          {b.n > 0 && <text x={L + i * bw + bw / 2} y={y(b.n) - 3} fontSize={11} textAnchor="middle">{b.n}</text>}
          <text x={L + i * bw + bw / 2} y={H - 20} fontSize={11} textAnchor="middle">{width === 1 ? b.lo : `${b.lo}..${b.lo + width - 1}`}</text>
        </g>
      ))}
      <text x={(W + L) / 2} y={H - 4} fontSize={11} textAnchor="middle" fill="#374151">Gain in points</text>
    </svg>
  );
}

function DayBars({ days }: { days: StudyResultsRes['participation']['days'] }) {
  const W = 560; const H = 160; const L = 36; const T = 14; const B = 26;
  const bw = (W - L - 8) / Math.max(1, days.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of students who completed each study day" style={{ width: '100%', maxWidth: 640 }}>
      <title>Percentage of students who completed the daily set, by study day</title>
      {[0, 50, 100].map((v) => <g key={v}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#d1d5db" /><text x={L - 5} y={y(v) + 4} fontSize={11} textAnchor="end">{v}%</text></g>)}
      {days.map((d, i) => (
        <g key={d.dayNo}>
          <rect x={L + i * bw + 2} y={y(d.pct ?? 0)} width={Math.max(2, bw - 4)} height={Math.max(0, y(0) - y(d.pct ?? 0))} fill={POST} stroke="#000" strokeWidth={0.5}><title>{`Day ${d.dayNo} (${d.date}): ${d.completed} of ${d.of}`}</title></rect>
          <text x={L + i * bw + bw / 2} y={H - 10} fontSize={10} textAnchor="middle">{d.dayNo}</text>
        </g>
      ))}
    </svg>
  );
}
