import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ERROR_LABELS, type SentenceErrorCode, type SpellingErrorCode } from '@shabd/core';
import { api } from '../shared/api.ts';
import { codeFromLabel, REMEDIES } from './remedies.ts';
import { Bar, errMsg, Page, useLoad } from './ui.tsx';

function sortedCounts(o: Partial<Record<string, number>>): [string, number][] {
  return Object.entries(o).filter((e): e is [string, number] => (e[1] ?? 0) > 0).sort((a, b) => b[1] - a[1]);
}

export function StudentDetail() {
  const studentId = Number(useParams().studentId);
  const { data, setData, error, loading } = useLoad(() => api.studentDetail(studentId), [studentId]);
  const [msg, setMsg] = useState<string | null>(null);
  const classId = data?.student.classId;

  const reset = async () => {
    if (!data || !window.confirm(`Reset PIN for ${data.student.firstName}?`)) return;
    try { const s = await api.resetPin(studentId); setData({ ...data, student: s }); setMsg(`New PIN: ${s.pin}`); } catch (e) { setMsg(errMsg(e)); }
  };

  const p = data?.profile;
  const spErrors = p ? sortedCounts(p.spellingErrorCounts) : [];
  const snErrors = p ? sortedCounts(p.sentenceErrorCounts) : [];
  const spTotal = spErrors.reduce((a, [, n]) => a + n, 0);
  const example = (code: string) => {
    const e = data?.spellingErrors.find((x) => x.primary === code);
    return e ? `${e.word} → ${e.input}` : null;
  };

  return (
    <Page classId={classId} loading={loading} error={error}>
      {data && p && (
        <>
          <header className="card stack">
            <div className="row t-head">
              <span className="t-avatar" aria-hidden="true">{data.student.avatar}</span>
              <div>
                <h1 className="title deva">{data.student.firstName} <span className="muted">· roll {data.student.rollNo}</span></h1>
                <div className="muted">PIN <code className="t-pin">{data.student.pin}</code> · {p.sessionsCompleted} sessions</div>
              </div>
            </div>
            <div className="row t-actions">
              <button className="btn" onClick={reset}>Reset PIN</button>
              {classId && <Link className="btn" to={`/teacher/classes/${classId}/analytics`}>← Class analytics</Link>}
            </div>
            {msg && <div className="feedback-ok" role="status">{msg}</div>}
          </header>

          <section className="card stack">
            <h2 className="t-h2">Strength</h2>
            <Bar label="Spelling" value={p.spellingStrength} max={100} text={p.spellingStrength === null ? undefined : `${Math.round(p.spellingStrength)}%`} color="var(--c-listen)" />
            <Bar label="Sentences" value={p.sentenceStrength} max={100} text={p.sentenceStrength === null ? undefined : `${Math.round(p.sentenceStrength)}%`} color="var(--c-write)" />
          </section>

          <section className="card stack">
            <h2 className="t-h2">Needs support</h2>
            {p.weaknessLabels.length === 0 && <p className="muted">No clear weakness yet (needs at least 10 events).</p>}
            {p.weaknessLabels.map((l) => {
              const code = codeFromLabel(l);
              return (
                <div key={l} className="t-weak-item">
                  <span className="t-badge t-badge-warn">{l}</span>
                  {code && REMEDIES[code] && <p><b>Try:</b> {REMEDIES[code]}</p>}
                </div>
              );
            })}
          </section>

          <section className="card stack">
            <h2 className="t-h2">Spelling errors</h2>
            {spErrors.length === 0 ? <p className="muted">No spelling errors recorded.</p> : spErrors.slice(0, 6).map(([code, n]) => (
              <Bar key={code} label={`${ERROR_LABELS[code as SpellingErrorCode]}${example(code) ? ` (${example(code)})` : ''}`} value={n} max={spTotal || 1} text={`${n}`} color="var(--c-warn)" />
            ))}
          </section>

          <section className="card stack">
            <h2 className="t-h2">Sentence writing</h2>
            {p.rubricAverages ? (
              <>
                <Bar label="Word use /10" value={p.rubricAverages.use} max={10} text={p.rubricAverages.use.toFixed(1)} color="var(--c-learn)" />
                <Bar label="Grammar /10" value={p.rubricAverages.grammar} max={10} text={p.rubricAverages.grammar.toFixed(1)} color="var(--c-learn)" />
                <Bar label="Relevance /12" value={p.rubricAverages.relevance} max={12} text={p.rubricAverages.relevance.toFixed(1)} color="var(--c-learn)" />
                <Bar label="Length /8" value={p.rubricAverages.length} max={8} text={p.rubricAverages.length.toFixed(1)} color="var(--c-learn)" />
              </>
            ) : <p className="muted">No sentences yet.</p>}
            {snErrors.length > 0 && <h3 className="t-h3">Common sentence issues</h3>}
            {snErrors.slice(0, 6).map(([code, n]) => (
              <Bar key={code} label={ERROR_LABELS[code as SentenceErrorCode]} value={n} max={snErrors[0][1]} text={`${n}`} color="var(--c-warn)" />
            ))}
          </section>

          <section className="stack">
            <h2 className="t-h2">Recent sessions</h2>
            <div className="t-scroll"><table>
              <thead><tr><th>Date</th><th>Marks /500</th><th>XP</th><th>Streak</th></tr></thead>
              <tbody>
                {data.sessions.map((s) => <tr key={s.sessionId}><td>{s.date}</td><td>{s.totalMarks}</td><td>{s.xp.total}</td><td>{s.streak.current}</td></tr>)}
                {data.sessions.length === 0 && <tr><td colSpan={4} className="muted">No sessions yet.</td></tr>}
              </tbody>
            </table></div>

            <h2 className="t-h2">Spelling mistakes</h2>
            <div className="t-scroll"><table>
              <thead><tr><th>Date</th><th>Word</th><th>Typed</th><th>Attempt</th><th>Type</th></tr></thead>
              <tbody>
                {data.spellingErrors.map((e, i) => <tr key={i}><td>{e.date}</td><td>{e.word}</td><td>{e.input || '(blank)'}</td><td>{e.attemptNo}</td><td>{ERROR_LABELS[e.primary]}</td></tr>)}
                {data.spellingErrors.length === 0 && <tr><td colSpan={5} className="muted">None.</td></tr>}
              </tbody>
            </table></div>

            <h2 className="t-h2">Sentences</h2>
            <div className="t-scroll"><table>
              <thead><tr><th>Date</th><th>Word</th><th>Sentence</th><th>Use/Gr/Rel/Len</th><th>Marks</th><th>By</th><th>Tip</th></tr></thead>
              <tbody>
                {data.sentences.map((s, i) => (
                  <tr key={i}>
                    <td>{s.date}</td><td>{s.word}</td><td className="t-sentence">{s.text}</td>
                    <td>{s.rubric.use}/{s.rubric.grammar}/{s.rubric.relevance}/{s.rubric.length}</td>
                    <td>{s.finalMarks ?? '–'}</td><td>{s.evaluator.split(':')[0]}</td><td>{s.tip ?? ''}</td>
                  </tr>
                ))}
                {data.sentences.length === 0 && <tr><td colSpan={7} className="muted">None.</td></tr>}
              </tbody>
            </table></div>
          </section>
        </>
      )}
    </Page>
  );
}
