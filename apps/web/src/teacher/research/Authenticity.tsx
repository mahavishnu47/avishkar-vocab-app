import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AuthenticityRes, ReviewStatus } from '@shabd/core';
import { FLAG_LABELS } from '@shabd/core';
import { authenticityApi } from '../../shared/research/authenticity-api.ts';
import { Page } from '../ui.tsx';

export default function Authenticity() {
  const { classId } = useParams();
  const cid = classId ? Number(classId) : 0;
  const [data, setData] = useState<AuthenticityRes | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    authenticityApi.get(cid, from || undefined, to || undefined).then(setData).catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Could not load'));
  }, [cid, from, to]);
  useEffect(() => { if (cid) load(); }, [cid, load]);

  const review = async (kind: 'daily' | 'test', id: number | string, status: ReviewStatus | null) => {
    try { await authenticityApi.review(cid, kind, id, status); load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
  };

  const s = data?.summary;
  return (
    <Page classId={cid || undefined} title="Sentence check">
      <p className="muted">These are hints to look at, not decisions. Children never see them.</p>
      {err && <div role="alert" className="error">{err}</div>}
      <div className="card row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {s && (
        <div className="card" aria-label="Own-work summary">
          <b>{s.noFlagPct ?? 0}%</b> of {s.sentences} sentences had nothing to check ({s.flagged} to check, {s.peerMatches} matching a classmate).
          {' '}Own-work rate after your review: <b>{s.ownWorkPct ?? 0}%</b>. Marked not own work: {s.teacherConfirmedCopy}.
        </div>
      )}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table aria-label="Per student counts">
            <thead><tr><th>Roll</th><th>Name</th><th>Sentences</th><th>To check</th><th>Not own work</th></tr></thead>
            <tbody>
              {data.students.map((r) => <tr key={r.studentId}><td>{r.rollNo}</td><td>{r.firstName}</td><td>{r.sentences}</td><td>{r.flagged}</td><td>{r.notOwn}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      {data && data.items.length === 0 && <p className="muted">Nothing to check. Well done, class!</p>}
      <ul className="stack" style={{ listStyle: 'none', padding: 0 }} aria-label="Sentences to check">
        {data?.items.map((it) => (
          <li key={`${it.kind}-${it.id}`} className="card">
            <div><b>{it.firstName}</b> (roll {it.rollNo}) · {it.word} · {it.kind === 'test' ? 'Test' : 'Daily'} · {it.date}</div>
            <p style={{ margin: '6px 0' }}>&ldquo;{it.text}&rdquo;</p>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {it.flags.map((f) => (
                <span key={f} className="chip">{FLAG_LABELS[f]}{f === 'peer_match' && it.matchedFirstName ? ` (${it.matchedFirstName})` : ''}</span>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn" aria-pressed={it.reviewStatus === 'ok'} onClick={() => void review(it.kind, it.id, it.reviewStatus === 'ok' ? null : 'ok')}>Own work</button>
              <button className="btn" aria-pressed={it.reviewStatus === 'not_own'} onClick={() => void review(it.kind, it.id, it.reviewStatus === 'not_own' ? null : 'not_own')}>Not own work</button>
            </div>
          </li>
        ))}
      </ul>
    </Page>
  );
}
