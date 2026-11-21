import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { JoinClassRes, JoinStudent } from '@shabd/core';
import { api, ApiRequestError } from '../shared/api.ts';
import { flush } from '../shared/outbox.ts';
import { kidError, ScreenHead } from './common.tsx';
import { ForgotPin } from './ForgotPin.tsx';
import { isInAppBrowser, PickName } from './PickName.tsx';
import { PinPad } from './PinPad.tsx';
import { getProfile, markChosen, saveLogin, setActive, setLastLink, wouldEvict, type Profile } from './profiles.ts';

type JoinState = { join?: JoinClassRes } | null;

function useJoin(classCode: string, preloaded?: JoinClassRes) {
  const [res, setRes] = useState<JoinClassRes | null>(preloaded && preloaded.classRoom.classCode.toUpperCase() === classCode.toUpperCase() ? preloaded : null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (res) return;
    let live = true;
    api.joinClass(classCode).then((r) => { if (live) setRes(r); }).catch((e) => { if (live) setErr(kidError(e)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classCode]);
  return { res, err };
}

/** /j/:classCode - step 1, tap your name. */
export function JoinPage() {
  const { classCode = '' } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { res, err } = useJoin(classCode, (loc.state as JoinState)?.join);
  const [evict, setEvict] = useState<{ student: JoinStudent; out: Profile } | null>(null);

  useEffect(() => { setLastLink(`/j/${classCode}`); }, [classCode]);

  const go = (s: JoinStudent) => {
    nav(`/j/${classCode}/pin/${s.id}`, { state: { student: s, className: res?.classRoom.name, schoolName: res?.schoolName } });
  };
  const pick = (s: JoinStudent) => {
    const known = getProfile(s.id);
    if (known?.token) { setActive(s.id); markChosen(); nav('/', { replace: true }); return; } // already on this phone: one tap
    const out = wouldEvict(s.id);
    if (out) setEvict({ student: s, out }); else go(s);
  };

  if (err) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 72 }}>🤔</div>
        <p className="title" style={{ textAlign: 'center' }}>{err}</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => nav('/login')}>Type a class code</button>
      </main>
    );
  }
  if (!res) return <main className="screen center student-screen"><div className="mitra-bird spin">🦜</div></main>;

  if (evict) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 64 }}>{evict.out.avatar}</div>
        <p className="title" style={{ textAlign: 'center' }}>This phone is full. Remove {evict.out.firstName} to add {evict.student.firstName}?</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => go(evict.student)}>Yes, remove {evict.out.firstName}</button>
        <button className="btn btn-block btn-tall" onClick={() => setEvict(null)}>No</button>
      </main>
    );
  }

  return (
    <main className="screen student-screen">
      {isInAppBrowser() && <div className="banner-tip" role="note">For best results, open in Chrome ⋮ → Open in Chrome</div>}
      <ScreenHead onBack={() => nav('/')} say="Find your name" />
      <h1 className="title">Find your name</h1>
      <p className="muted" style={{ margin: 0 }}>Class {res.classRoom.name} · {res.schoolName}</p>
      {res.students.length === 0
        ? <p className="center" style={{ textAlign: 'center' }}>Your teacher is still adding names. Come back soon 🙂</p>
        : <PickName students={res.students} onPick={pick} />}
    </main>
  );
}

interface PinState { student?: JoinStudent; className?: string; schoolName?: string; from?: 'who' }

/** /j/:classCode/pin/:studentId - step 2, your PIN. */
export function PinScreen() {
  const { classCode = '', studentId = '' } = useParams();
  const sid = Number(studentId);
  const nav = useNavigate();
  const loc = useLocation();
  const st = (loc.state as PinState | null) ?? {};
  const profile = getProfile(sid);
  const [who, setWho] = useState<{ firstName: string; avatar: string } | null>(
    st.student ? { firstName: st.student.firstName, avatar: st.student.avatar } : profile ? { firstName: profile.firstName, avatar: profile.avatar } : null);
  const [linkErr, setLinkErr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(0);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (who) return;
    let live = true;
    api.joinClass(classCode).then((r) => {
      if (!live) return;
      const s = r.students.find((x) => x.id === sid);
      if (s) setWho({ firstName: s.firstName, avatar: s.avatar }); else nav(`/j/${classCode}`, { replace: true });
    }).catch((e) => { if (live) setLinkErr(kidError(e)); });
    return () => { live = false; };
  }, [who, classCode, sid, nav]);

  const submit = async (pin: string) => {
    setBusy(true); setErr('');
    try {
      const r = await api.studentLogin({ classCode, studentId: sid, pin });
      saveLogin(r);
      markChosen();
      setLastLink(`/j/${r.classCode || classCode}`);
      void flush(); // anything this child queued while signed out goes now, with their own token
      nav(r.firstLogin ? '/welcome' : '/', { replace: true });
    } catch (e) {
      setBad((n) => n + 1);
      if (e instanceof ApiRequestError && e.status === 401) setErr('Try again 💪');
      else if (e instanceof ApiRequestError && e.status === 404) setErr('Ask your teacher for the new link 🙂');
      else setErr(kidError(e));
    } finally { setBusy(false); }
  };

  if (forgot) return <ForgotPin onBack={() => setForgot(false)} />;
  if (linkErr) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 72 }}>🤔</div>
        <p className="title" style={{ textAlign: 'center' }}>{linkErr}</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => nav('/login')}>Type a class code</button>
      </main>
    );
  }
  return (
    <main className="screen student-screen">
      <ScreenHead onBack={() => nav(st.from === 'who' ? '/who' : `/j/${classCode}`)} say="Type your PIN" />
      <div className="center" style={{ textAlign: 'center' }}>
        <div className="avatar" style={{ fontSize: 64 }}>{who?.avatar ?? '🦜'}</div>
        <div className="title">{who?.firstName ?? '…'}</div>
        <p className="muted" style={{ margin: 0 }}>Type your PIN</p>
      </div>
      <PinPad onSubmit={(p) => void submit(p)} disabled={busy || !who} resetKey={bad} wobble={bad > 0 && !busy} />
      <div className="err center" role="alert" style={{ textAlign: 'center' }}>{err}</div>
      <button className="link" style={{ alignSelf: 'center' }} onClick={() => setForgot(true)}>Forgot PIN? 🙋</button>
    </main>
  );
}
