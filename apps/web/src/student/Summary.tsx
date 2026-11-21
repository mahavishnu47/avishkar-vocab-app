import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SessionSummaryRes, StudentHomeRes, TodaySessionRes, WordScore } from '@shabd/core';
import { starsFor } from '@shabd/core';
import { api, ApiRequestError } from '../shared/api.ts';
import { enqueue } from '../shared/outbox.ts';
import { loadSession, loadToday, saveSession } from '../shared/session-store.ts';
import { handleAuthError, storedHome, storedStudent, useRequireToken } from './common.tsx';
import type { PlayState } from './play-logic.ts';
import { localSummary } from './safe-core.ts';

const race = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new ApiRequestError(0, 'network', 'timeout')), ms))]);

function Stars({ n }: { n: number }) {
  return <span className="stars" aria-label={`${n} stars`}>{[0, 1, 2].map((i) => <span key={i} className={i < n ? '' : 'off'}>★</span>)}</span>;
}
function starsSafe(total: number): number { try { return starsFor(total); } catch { return total >= 90 ? 3 : total >= 60 ? 2 : total >= 30 ? 1 : 0; } }

export function Summary() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [qs] = useSearchParams();
  const [sum, setSum] = useState<SessionSummaryRes | null>(null);
  const [local, setLocal] = useState(false);
  const [words, setWords] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    (async () => {
      const student = storedStudent();
      const today = student ? loadToday<TodaySessionRes>(student.id) : null;
      const sid = Number(qs.get('s')) || today?.session.id;
      if (!sid) { nav('/', { replace: true }); return; }
      if (today) setWords(Object.fromEntries(today.words.map((w) => [w.id, w.word])));
      const st = loadSession<PlayState>(sid);
      if (st?.summary && !st.summaryLocal) { setSum(st.summary); return; }
      if (st && !st.sessionEnqueued && st.stage === 'summary') {
        st.sessionEnqueued = true; saveSession(sid, st);
        enqueue({ kind: 'completeSession', sessionId: sid });
      }
      try {
        const r = await race(api.completeSession(sid), 5000);
        if (!live) return;
        setSum(r); setLocal(false);
        if (st) saveSession(sid, { ...st, summary: r, summaryLocal: false });
      } catch (e) {
        if (handleAuthError(e, nav)) return;
        if (st?.summary) { setSum(st.summary); setLocal(true); return; }
        const home = storedHome() as StudentHomeRes | null;
        const prev = home ? { current: Math.max(0, home.streak), best: home.bestStreak, lastCompletedDate: null } : null;
        const ls = st && today ? localSummary(sid, today.session.date, st.localScores, prev, today.session.date) : null;
        if (!live) return;
        if (ls) { setSum(ls); setLocal(true); if (st) saveSession(sid, { ...st, summary: ls, summaryLocal: true }); }
        else setFailed(true);
      }
    })();
    return () => { live = false; };
  }, [authed, nav, qs]);

  if (!sum) {
    return <main className="screen center student-screen"><div className="mitra-bird spin">🦜</div><p>{failed ? 'No internet. Your work is saved 🙂' : 'Counting your stars…'}</p>
      {failed && <button className="btn btn-primary" onClick={() => nav('/')}>Home</button>}</main>;
  }
  const sc = (s: WordScore, i: number) => words[s.wordId] ?? `Word ${i + 1}`;
  return (
    <main className="screen student-screen">
      <div className="flame pop" aria-label={`streak ${sum.streak.current} days`}>🔥<div className="big-num">{sum.streak.current} {sum.streak.current === 1 ? 'day' : 'days'} <span className="pop" style={{ color: 'var(--c-streak)' }}>+1</span></div></div>
      <div className="card stack">
        <div className="title center" style={{ textAlign: 'center' }}>{sum.totalMarks} / 500</div>
        {sum.wordScores.map((s, i) => (
          <div className="sum-row" key={s.wordId}><b>{sc(s, i)}</b><Stars n={starsSafe(s.total)} /><span>{s.total}</span></div>
        ))}
      </div>
      <div className="card stack">
        <div className="sum-row"><span>Word marks</span><b>{sum.xp.wordMarks}</b></div>
        <div className="sum-row"><span>🎉 Finished bonus</span><b>+{sum.xp.completionBonus}</b></div>
        <div className="sum-row"><span>🔥 Streak bonus</span><b>+{sum.xp.streakBonus}</b></div>
        <div className="sum-row"><span>⭐ Perfect words</span><b>+{sum.xp.perfectBonus}</b></div>
        <div className="sum-row" style={{ borderTop: '2px solid var(--c-border)', paddingTop: 8 }}><b>XP today</b><b>{sum.xp.total}</b></div>
      </div>
      {local && <p className="muted center" style={{ textAlign: 'center' }}>☁️ will sync</p>}
      <button className="btn btn-primary btn-block btn-tall" onClick={() => nav('/', { replace: true })}>Home</button>
    </main>
  );
}
