/** F9 teacher page (route /teacher/study/:studyId/instruments/*): weekly observation grid, feedback window, paper entry, summary bars. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FeedbackAnswer, ObservationKey, ObservationRow } from '@shabd/core';
import { FEEDBACK_ANSWER_LABEL, FEEDBACK_ANSWERS, FEEDBACK_ITEMS, OBSERVATION_INDICATORS, OBSERVATION_MAX_WEEK } from '@shabd/core';
import { instrumentsApi } from '../../shared/research/instruments-api.ts';
import { errMsg, Page, useLoad } from '../ui.tsx';

export default function Instruments() {
  const studyId = Number(useParams().studyId);
  return (
    <Page title="Observations and feedback">
      <Link className="btn" to={`/teacher/study/${studyId}`}>Back to study</Link>
      <ObservationGrid studyId={studyId} />
      <Feedback studyId={studyId} />
    </Page>
  );
}

function ObservationGrid({ studyId }: { studyId: number }) {
  const [week, setWeek] = useState(1);
  const { data, setData, error, loading } = useLoad(() => instrumentsApi.observations(studyId, week), [studyId, week]);
  const [err, setErr] = useState<string | null>(null);

  const tap = async (row: ObservationRow, key: ObservationKey, v: boolean) => {
    const next = row.values[key] === v ? null : v; // tapping the chosen answer again clears it
    setErr(null);
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.studentId === row.studentId ? { ...r, values: { ...r.values, [key]: next } } : r)) });
    try { await instrumentsApi.putObservation(studyId, row.studentId, week, { [key]: next }); } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <section className="card stack">
      <h2 className="t-h2">Weekly observation</h2>
      <label className="row">Week{' '}
        <select aria-label="Week" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
          {Array.from({ length: OBSERVATION_MAX_WEEK }, (_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}
        </select>
      </label>
      {(error || err) && <div className="t-error" role="alert">{error ?? err}</div>}
      {loading && <p className="muted">Loading…</p>}
      {data && data.rows.length === 0 && <p className="muted">No students in this study yet.</p>}
      {data?.rows.map((r) => (
        <div key={r.studentId} className="card stack" aria-label={`Observation for ${r.firstName}`}>
          <strong>{r.studyCode} · {r.rollNo}. {r.firstName}</strong>
          {OBSERVATION_INDICATORS.map((ind) => (
            <div key={ind.key} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span>{ind.label}</span>
              <span className="row" style={{ gap: 6 }}>
                <button className={`btn ${r.values[ind.key] === true ? 'btn-primary' : ''}`} aria-pressed={r.values[ind.key] === true} aria-label={`${r.firstName}: ${ind.label}: Yes`} onClick={() => void tap(r, ind.key, true)}>Yes</button>
                <button className={`btn ${r.values[ind.key] === false ? 'btn-primary' : ''}`} aria-pressed={r.values[ind.key] === false} aria-label={`${r.firstName}: ${ind.label}: No`} onClick={() => void tap(r, ind.key, false)}>No</button>
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function Feedback({ studyId }: { studyId: number }) {
  const { data, setData, error, loading, reload } = useLoad(() => instrumentsApi.feedback(studyId), [studyId]);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async (open: boolean) => {
    setErr(null);
    try { await instrumentsApi.setWindow(studyId, open); reload(); } catch (e) { setErr(errMsg(e)); }
  };
  const paper = async (studentId: number, itemNo: number, answer: FeedbackAnswer) => {
    setErr(null);
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.studentId === studentId ? { ...r, source: 'paper', answers: r.answers.map((a, i) => (i + 1 === itemNo ? answer : a)) } : r)) });
    try { await instrumentsApi.putPaper(studyId, studentId, [{ itemNo, answer }]); reload(); } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <section className="card stack">
      <h2 className="t-h2">Student questionnaire</h2>
      {(error || err) && <div className="t-error" role="alert">{error ?? err}</div>}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <p>{data.open ? 'Open: children can answer in the app.' : data.closedAt ? 'Closed.' : 'Not opened yet.'}</p>
          {data.open
            ? <button className="btn" onClick={() => void toggle(false)}>Close questionnaire</button>
            : <button className="btn btn-primary" onClick={() => void toggle(true)}>{data.closedAt ? 'Reopen questionnaire' : 'Open questionnaire'}</button>}

          <h3 className="t-h2">Answers so far ({data.summary.respondents} analysable)</h3>
          {data.summary.items.map((it) => (
            <div key={it.itemNo} aria-label={`Item ${it.itemNo} summary`}>
              <div>{it.itemNo}. {it.text}</div>
              <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--line, #ddd)' }} role="img" aria-label={`Yes ${it.pctYes}%, To some extent ${it.pctSome}%, No ${it.pctNo}%`}>
                <span style={{ width: `${it.pctYes}%`, background: '#2e9e5b' }} />
                <span style={{ width: `${it.pctSome}%`, background: '#e0a526' }} />
                <span style={{ width: `${it.pctNo}%`, background: '#d9534f' }} />
              </div>
              <span className="muted">Yes {it.yes} · To some extent {it.some} · No {it.no}</span>
            </div>
          ))}

          <h3 className="t-h2">Paper answers</h3>
          <p className="muted">Type in a child's answers from the paper form. Each tap saves.</p>
          {data.rows.map((r) => (
            <details key={r.studentId} className="card">
              <summary>{r.studyCode} · {r.rollNo}. {r.firstName} — {r.answers.filter((a) => a !== null).length} of {FEEDBACK_ITEMS.length} answered</summary>
              {FEEDBACK_ITEMS.map((it) => (
                <div key={it.itemNo} className="stack">
                  <span>{it.itemNo}. {it.text}</span>
                  <span className="row" style={{ gap: 6 }}>
                    {FEEDBACK_ANSWERS.map((a) => (
                      <button key={a} className={`btn ${r.answers[it.itemNo - 1] === a ? 'btn-primary' : ''}`} aria-pressed={r.answers[it.itemNo - 1] === a}
                        aria-label={`${r.firstName}, item ${it.itemNo}: ${FEEDBACK_ANSWER_LABEL[a]}`} onClick={() => void paper(r.studentId, it.itemNo, a)}>{FEEDBACK_ANSWER_LABEL[a]}</button>
                    ))}
                  </span>
                </div>
              ))}
            </details>
          ))}
        </>
      )}
    </section>
  );
}
