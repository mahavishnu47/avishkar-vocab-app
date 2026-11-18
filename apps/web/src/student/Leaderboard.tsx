import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LeaderboardRes } from '@shabd/core';
import { api } from '../shared/api.ts';
import { handleAuthError, TopBar, useRequireToken } from './common.tsx';

export function Leaderboard() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [lb, setLb] = useState<LeaderboardRes | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!authed) return;
    api.studentLeaderboard().then((r) => {
      if (r.mode === 'hidden') nav('/', { replace: true }); else setLb(r);
    }).catch((e) => { if (!handleAuthError(e, nav)) setErr(true); });
  }, [authed, nav]);

  const inTop = lb?.entries.some((e) => e.isMe || e.studentId === lb.me?.studentId);
  return (
    <main className="screen student-screen">
      <TopBar left={<button className="btn btn-icon small" aria-label="back" onClick={() => nav('/')}>←</button>} />
      <h1 className="title">🏆 This week</h1>
      {err && <p>No internet 🙂</p>}
      {!lb && !err && <p>Loading…</p>}
      <div className="stack" role="list">
        {lb?.entries.map((e) => (
          <div key={e.studentId} role="listitem" className={`lb-row ${e.isMe || e.studentId === lb.me?.studentId ? 'me' : ''}`}>
            <b>#{e.rank}</b><span className="avatar" style={{ fontSize: 28 }}>{e.avatar}</span><span className="name">{e.firstName}</span><b>{e.xp} XP</b>
          </div>
        ))}
        {lb?.me && !inTop && (
          <div className="lb-row me sticky-me" role="listitem">
            <b>#{lb.me.rank}</b><span className="avatar" style={{ fontSize: 28 }}>{lb.me.avatar}</span><span className="name">{lb.me.firstName}</span><b>{lb.me.xp} XP</b>
          </div>
        )}
      </div>
      <p className="muted center" style={{ textAlign: 'center' }}>Every day you play gives bonus XP!</p>
    </main>
  );
}
