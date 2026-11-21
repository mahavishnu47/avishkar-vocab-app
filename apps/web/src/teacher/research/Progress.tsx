import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ProgressRes, ProgressStudentRow } from '@shabd/core';
import { progressApi } from '../../shared/research/progress-api.ts';
import { Page } from '../ui.tsx';

type SortKey = 'who' | 'daysActive' | 'daysCompleted' | 'wordsCompleted' | 'meaningFirstTryPct' | 'posFirstTryPct' | 'sentenceAvgPct' | 'recallPct' | 'lastActive';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'daysActive', label: 'Days active' },
  { key: 'daysCompleted', label: 'Days completed' },
  { key: 'wordsCompleted', label: 'Words done' },
  { key: 'meaningFirstTryPct', label: 'Meaning first try' },
  { key: 'posFirstTryPct', label: 'Word type first try' },
  { key: 'sentenceAvgPct', label: 'Sentence avg' },
  { key: 'recallPct', label: 'Recall' },
  { key: 'lastActive', label: 'Last active' },
];

const chipStyle = (v: number | null): React.CSSProperties => {
  const bg = v === null ? '#e5e7eb' : v >= 80 ? '#bbf7d0' : v >= 50 ? '#fef08a' : '#fecaca';
  return { background: bg, color: '#111827', borderRadius: 999, padding: '2px 8px', fontWeight: 600, display: 'inline-block', minWidth: 44, textAlign: 'center' };
};
const Pct = ({ v }: { v: number | null }) => <span style={chipStyle(v)}>{v === null ? '-' : `${v}%`}</span>;

const PRINT_CSS = `
.progress-print-only { display: none; }
@media print {
  .progress-print-only { display: block; }
  .progress-screen-only { display: none !important; }
  .progress-grid { overflow: visible !important; }
  .progress-grid table { font-size: 10px; }
  .progress-grid th, .progress-grid td { border: 1px solid #000; padding: 2px 4px; }
}`;

export default function Progress() {
  const { classId } = useParams();
  const cid = classId ? Number(classId) : 0;
  const [data, setData] = useState<ProgressRes | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  const [codes, setCodes] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'who', dir: 1 });

  const load = useCallback(() => {
    progressApi.get(cid, from || undefined, to || undefined).then(setData).catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Could not load'));
  }, [cid, from, to]);
  useEffect(() => { if (cid) load(); }, [cid, load]);

  const label = (s: ProgressStudentRow) => (codes ? (s.studyCode ?? `Roll ${s.rollNo}`) : s.firstName);

  const rows = useMemo(() => {
    if (!data) return [];
    const val = (s: ProgressStudentRow): number | string => {
      if (sort.key === 'who') return codes ? (s.studyCode ?? `~${String(s.rollNo).padStart(4, '0')}`) : s.rollNo;
      return s[sort.key] ?? (sort.key === 'lastActive' ? '' : -1);
    };
    return [...data.students].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [data, sort, codes]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'who' ? 1 : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
  const short = (d: string) => d.slice(5);

  return (
    <Page classId={cid || undefined} title="Progress">
      <style>{PRINT_CSS}</style>
      {err && <div role="alert" className="error">{err}</div>}
      <div className="card row no-print" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={codes} onChange={(e) => setCodes(e.target.checked)} />
          Show study codes instead of names
        </label>
        <button className="btn" onClick={() => window.print()}>Print record</button>
      </div>
      {data && (
        <p className="muted no-print">
          {data.inStudy ? 'Study school days' : 'Weekdays'} from {data.from} to {data.to}. Percentages are first-try accuracy; blank means no data yet.
        </p>
      )}

      {data && (
        <div className="card progress-screen-only" style={{ overflowX: 'auto' }}>
          <table aria-label="Student progress" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th aria-sort={ariaSort('who')}><button className="t-link" onClick={() => toggleSort('who')}>{codes ? 'Code' : 'Student'}{arrow('who')}</button></th>
                {COLUMNS.map((c) => (
                  <th key={c.key} aria-sort={ariaSort(c.key)}><button className="t-link" onClick={() => toggleSort(c.key)}>{c.label}{arrow(c.key)}</button></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.studentId}>
                  <td><Link to={`/teacher/students/${s.studentId}`}>{label(s)}</Link></td>
                  <td>{s.daysActive}</td>
                  <td>{s.daysCompleted}</td>
                  <td>{s.wordsCompleted}</td>
                  <td><Pct v={s.meaningFirstTryPct} /></td>
                  <td><Pct v={s.posFirstTryPct} /></td>
                  <td><Pct v={s.sentenceAvgPct} /></td>
                  <td><Pct v={s.recallPct} /></td>
                  <td>{s.lastActive ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="muted">No students in this class yet.</p>}
        </div>
      )}

      {data && (
        <section className="card progress-grid" style={{ overflowX: 'auto' }} aria-label="Daily vocabulary assignment record">
          <h2 style={{ marginTop: 0 }}>Daily vocabulary assignment record</h2>
          <p className="muted">Words done out of {data.wordsPerDay} each day. A dash means the child did not start that day.</p>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>{codes ? 'Code' : 'Student'}</th>
                {data.days.map((d, i) => <th key={d} title={d}>{data.inStudy ? `D${i + 1}` : short(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.studentId}>
                  <td>{label(s)}</td>
                  {data.days.map((d) => <td key={d} style={{ textAlign: 'center' }}>{s.grid[d] === null || s.grid[d] === undefined ? '-' : s.grid[d]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Page>
  );
}
