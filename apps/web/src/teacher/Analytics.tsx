import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ERROR_LABELS, type SentenceErrorCode, type SpellingErrorCode, type StudentErrorProfile } from '@shabd/core';
import { api } from '../shared/api.ts';
import { errMsg, Page, SortTable, useLoad, type Col } from './ui.tsx';
import { downloadCsv, heatStep, sum, topCodes } from './util.ts';

const EXPORTS = ['attempts', 'sentences', 'daily', 'students'] as const;

export function Analytics() {
  const classId = Number(useParams().classId);
  const navigate = useNavigate();
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const { data, error, loading } = useLoad(() => api.classAnalytics(classId, from, to), [classId, from, to]);
  const [msg, setMsg] = useState<string | null>(null);

  const cols = useMemo<Col<StudentErrorProfile>[]>(() => {
    if (!data) return [];
    const spCodes = topCodes<SpellingErrorCode>(data.students.map((s) => s.spellingErrorCounts), 5);
    const snCodes = topCodes<SentenceErrorCode>(data.students.map((s) => s.sentenceErrorCounts), 4);
    const cell = (r: StudentErrorProfile, kind: 'sp' | 'sn', code: SpellingErrorCode | SentenceErrorCode) => {
      const counts = (kind === 'sp' ? r.spellingErrorCounts : r.sentenceErrorCounts) as Record<string, number>;
      const classRates = (kind === 'sp' ? data.classSpellingRates : data.classSentenceRates) as Record<string, number>;
      const n = counts[code] ?? 0;
      const total = sum(counts);
      const rate = total ? n / total : 0;
      return { n, rate, step: heatStep(n, rate, classRates[code]) };
    };
    const heat = (kind: 'sp' | 'sn', code: SpellingErrorCode | SentenceErrorCode): Col<StudentErrorProfile> => ({
      key: `${kind}:${code}`, label: ERROR_LABELS[code], className: 't-heatcell',
      get: (r) => cell(r, kind, code).rate,
      render: (r) => {
        const c = cell(r, kind, code);
        return <span className={`t-heat t-heat-${c.step}`} title={`${c.n} events, ${Math.round(c.rate * 100)}% of this student's ${kind === 'sp' ? 'spelling' : 'sentence'} errors`}>
          {c.n ? `${c.n} · ${Math.round(c.rate * 100)}%` : '·'}
        </span>;
      },
    });
    return [
      { key: 'name', label: 'Student', get: (r) => r.firstName, render: (r) => <span className="deva">{r.avatar} {r.firstName}</span> },
      { key: 'spStrength', label: 'Spelling strength', get: (r) => r.spellingStrength, render: (r) => (r.spellingStrength === null ? '–' : `${Math.round(r.spellingStrength)}%`) },
      { key: 'snStrength', label: 'Sentence strength', get: (r) => r.sentenceStrength, render: (r) => (r.sentenceStrength === null ? '–' : `${Math.round(r.sentenceStrength)}%`) },
      // Weakness is the headline result, so it sits next to the strengths instead of after ~1000px of heatmap (B-17).
      { key: 'weak', label: 'Weakness', get: (r) => r.weaknessLabels.length, className: 't-weak',
        render: (r) => r.weaknessLabels.length ? r.weaknessLabels.map((l) => <span key={l} className="t-badge t-badge-warn">{l}</span>) : <span className="muted">–</span> },
      ...spCodes.map((c) => heat('sp', c)),
      ...snCodes.map((c) => heat('sn', c)),
    ];
  }, [data]);

  const download = async (type: (typeof EXPORTS)[number]) => {
    setMsg(null);
    try { await downloadCsv(api.exportCsvPath(classId, type), `${type}.csv`); } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <Page classId={classId} title="Class analytics" loading={loading && !data} error={error}>
      <div className="row t-range">
        <label>From <input type="date" aria-label="From" value={from ?? data?.from ?? ''} onChange={(e) => setFrom(e.target.value || undefined)} /></label>
        <label>To <input type="date" aria-label="To" value={to ?? data?.to ?? ''} onChange={(e) => setTo(e.target.value || undefined)} /></label>
      </div>
      <div className="row t-exports">
        {EXPORTS.map((t) => <button key={t} className="btn" onClick={() => download(t)}>⬇ {t} CSV</button>)}
      </div>
      {msg && <div className="t-error" role="alert">{msg}</div>}
      {data && (
        <>
          <p className="muted t-legend">
            Cells show the number of errors and the share of that student&apos;s errors. Darker = more than the class
            (<span className="t-heat t-heat-3">1.5×+</span> <span className="t-heat t-heat-2">above class</span> <span className="t-heat t-heat-1">below</span>).
            Click a heading to sort.
          </p>
          <SortTable rows={data.students} rowKey={(s) => s.studentId} cols={cols} onRow={(s) => navigate(`/teacher/students/${s.studentId}`)} caption="Class weakness heatmap" />
          <section className="card stack">
            <h2 className="t-h2">Hardest words</h2>
            {data.hardestWords.length === 0 ? <p className="muted">No data yet.</p> : (
              <ol className="t-hard">
                {data.hardestWords.map((w) => (
                  <li key={w.wordId}><b>{w.word}</b> <span className="muted">{Math.round(w.firstAttemptAccuracy * 100)}% right first time · {w.attempts} student{w.attempts === 1 ? '' : 's'}</span></li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
