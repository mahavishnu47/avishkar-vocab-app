import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudentHomeRes } from '@shabd/core';
import { api } from '../shared/api.ts';
import { handleAuthError, saveHome, storedHome, TopBar, useRequireToken } from './common.tsx';
import { InstallPrompt } from './InstallPrompt.tsx';

export function Home() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [home, setHome] = useState<StudentHomeRes | null>(storedHome());
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    api.studentHome().then((h) => {
      if (!live) return;
      setHome(h); setOffline(false); saveHome(h);
    }).catch((e) => { if (!handleAuthError(e, nav)) setOffline(true); });
    return () => { live = false; };
  }, [authed, nav]);

  if (!home) {
    return <main className="screen center student-screen"><div className="mitra-bird">🦜</div><p>{offline ? 'No internet 🙂' : 'Loading…'}</p>
      {offline && <button className="btn" onClick={() => location.reload()}>Try again</button>}</main>;
  }
  const st = home.today.status;
  const pct = Math.min(100, Math.round((home.level.xpIntoLevel / Math.max(1, home.level.xpForNextLevel)) * 100));
  return (
    <main className="screen student-screen">
      <TopBar
        left={<><button className="btn btn-icon small switch-btn" aria-label="Switch player" onClick={() => nav('/who')}><span className="avatar" style={{ fontSize: 24 }}>{home.student.avatar}</span>⇄</button><span className="name">Hi {home.student.firstName}</span></>}
        right={home.leaderboardMode !== 'hidden' ? <button className="btn btn-icon small" aria-label="leaderboard" onClick={() => nav('/leaderboard')}>🏆</button> : null}
      />
      <section className="card stack">
        <div className="streak-card">
          <div><div className="big-num">🔥 {home.streak}</div><div className="muted">{home.streak === 1 ? 'day!' : 'days!'}</div></div>
          <div><div className="big-num">⭐ {home.xpTotal}</div><div className="muted">Level {home.level.level + 1}</div></div>
        </div>
        <div className="levelbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="level progress"><div style={{ width: `${pct}%` }} /></div>
      </section>
      <section className="card stack">
        <div className="title" style={{ fontSize: 22 }}>Today</div>
        <div className="progress-dots" aria-label={`${home.today.wordsDone} of 5 words done`}>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`pd ${i < home.today.wordsDone ? 'on' : ''}`} />)}
        </div>
      </section>
      {st === 'completed' ? (
        <>
          <div className="feedback-ok pop" style={{ textAlign: 'center' }}>All done today! 🎉 Come back tomorrow</div>
          <button className="btn btn-primary btn-block btn-tall" onClick={() => nav(`/summary?s=${home.today.sessionId ?? ''}`)}>See my score</button>
        </>
      ) : (
        <button className="btn btn-primary btn-block btn-tall" style={{ fontSize: 24 }} onClick={() => nav('/play')}>
          {st === 'in_progress' ? 'Continue ▶' : "Start today's words ▶"}
        </button>
      )}
      {offline && <p className="muted center" style={{ textAlign: 'center' }}>No internet. Showing saved info.</p>}
      {(st === 'completed' || home.streak > 0) && <InstallPrompt />}
      <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="link" onClick={() => nav('/welcome')}>How to play</button>
        <button className="link" onClick={() => nav('/who')}>Not you?</button>
      </div>
    </main>
  );
}
