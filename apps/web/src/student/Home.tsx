import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudentHomeRes, StudyDayRes } from '@shabd/core';
import { api } from '../shared/api.ts';
import { wordPlanApi } from '../shared/research/wordplan-api.ts';
import { restMessage } from './research/cards/StudyDayCard.tsx';
import { getActiveProfile, getProfiles, removeProfile } from './profiles.ts';
import { handleAuthError, saveHome, storedHome, TopBar, useRequireToken } from './common.tsx';
import { InstallPrompt } from './InstallPrompt.tsx';
import { HomeCards } from './research/HomeCards.tsx';

export function Home() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [home, setHome] = useState<StudentHomeRes | null>(storedHome());
  const [offline, setOffline] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // undefined = still asking; null = asked (or offline) and nothing to say. Rest days hide the Start button, which would only bounce back here.
  const [day, setDay] = useState<StudyDayRes | null | undefined>(undefined);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    wordPlanApi.studyDay().then((d) => { if (live) setDay(d); }, () => { if (live) setDay(null); });
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
  const logOut = () => {
    const me = getActiveProfile();
    if (me?.token) void api.withToken(me.token).logout('student').catch(() => {});
    if (me) removeProfile(me.studentId);
    nav(getProfiles().length > 0 ? '/who' : '/', { replace: true });
  };
  if (loggingOut) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 64 }}>{home.student.avatar}</div>
        <p className="title" style={{ textAlign: 'center' }}>Log out {home.student.firstName} from this phone?</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={logOut}>Yes, log out</button>
        <button className="btn btn-block btn-tall" onClick={() => setLoggingOut(false)}>No</button>
      </main>
    );
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
          <div><div className="big-num">🔥 {home.streak}</div><div className="muted">{home.streak === 0 ? 'Play today to start a streak' : home.streak === 1 ? 'day in a row!' : 'days in a row!'}</div></div>
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
      <HomeCards home={home} day={day} />
      {st !== 'completed' && day && restMessage(day) ? null : st === 'completed' ? (
        <>
          <div className="feedback-ok pop" style={{ textAlign: 'center' }}>All done today! 🎉 Come back tomorrow</div>
          <button className="btn btn-primary btn-block btn-tall" onClick={() => nav(`/summary?s=${home.today.sessionId ?? ''}`)}>See my score</button>
        </>
      ) : (
        <button className="btn btn-primary btn-block btn-tall" style={{ fontSize: 24 }} onClick={() => nav('/play')}>
          {st === 'in_progress' ? 'Continue ▶' : "Start today's words ▶"}
        </button>
      )}
      <button className="btn btn-block" onClick={() => nav('/progress')}>My Progress 📈</button>
      {offline && <p className="muted center" style={{ textAlign: 'center' }}>No internet. Showing saved info.</p>}
      {(st === 'completed' || home.streak > 0) && <InstallPrompt />}
      <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="link" onClick={() => nav('/welcome')}>How to play</button>
        <button className="link" onClick={() => nav('/who')}>Not you?</button>
        <button className="link" onClick={() => setLoggingOut(true)}>Log out</button>
      </div>
    </main>
  );
}
