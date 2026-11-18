import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicRosterRes } from '@shabd/core';
import { api, ApiRequestError, setToken } from '../shared/api.ts';
import { LS, lsGet, lsSet } from './common.tsx';

type Step = 'code' | 'who' | 'pin';

export function Login() {
  const nav = useNavigate();
  const remembered = lsGet(LS.classCode);
  const [step, setStep] = useState<Step>(remembered ? 'who' : 'code');
  const [code, setCode] = useState(remembered ?? '');
  const [roster, setRoster] = useState<PublicRosterRes | null>(null);
  const [who, setWho] = useState<{ id: number; firstName: string; avatar: string } | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wob, setWob] = useState(0);
  const loadedFor = useRef('');

  const loadRoster = async (c: string) => {
    setBusy(true); setErr('');
    try {
      const r = await api.publicRoster(c);
      loadedFor.current = c;
      setRoster(r); setStep('who'); lsSet(LS.classCode, c);
    } catch (e) {
      const notFound = e instanceof ApiRequestError && (e.status === 404 || e.status === 400);
      setErr(notFound ? 'Class not found. Check the code 🙂' : 'No internet. Try again 🙂');
      setStep('code');
    } finally { setBusy(false); }
  };

  useEffect(() => { if (remembered && loadedFor.current !== remembered) void loadRoster(remembered); /* eslint-disable-next-line */ }, []);

  const submitPin = async (p: string) => {
    if (!who) return;
    setBusy(true); setErr('');
    try {
      const r = await api.studentLogin({ classCode: code, studentId: who.id, pin: p });
      setToken(r.token);
      lsSet(LS.student, JSON.stringify(r.student));
      lsSet(LS.home, null);
      nav('/', { replace: true });
    } catch (e) {
      setPin('');
      setWob((n) => n + 1);
      if (e instanceof ApiRequestError && e.status === 423) setErr('Too many tries. Wait 5 minutes 🙂');
      else if (e instanceof ApiRequestError && e.isNetwork) setErr('No internet. Try again 🙂');
      else setErr('Try again');
    } finally { setBusy(false); }
  };

  const press = (d: string) => {
    if (busy) return;
    if (d === 'back') { setPin((p) => p.slice(0, -1)); return; }
    if (d === 'ok') { if (pin.length === 4) void submitPin(pin); return; }
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) void submitPin(next);
  };

  if (step === 'code') {
    return (
      <main className="screen center student-screen">
        <div className="mitra-bird" style={{ fontSize: 72 }}>🦜</div>
        <h1 className="title">Shabd Mitra</h1>
        <form className="stack" style={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 4) void loadRoster(code.trim().toUpperCase()); }}>
          <label htmlFor="cc" className="muted">Class code</label>
          <input id="cc" className="code-input" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off"
            autoCorrect="off" spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <div className="err" role="alert">{err}</div>
          <button className="btn btn-primary btn-block" disabled={busy || code.length < 4}>{busy ? '…' : 'Next ▶'}</button>
        </form>
        <a className="link" href="/teacher">Teacher? Log in here</a>
      </main>
    );
  }

  if (step === 'who') {
    return (
      <main className="screen student-screen">
        <h1 className="title">Who are you? 🦜</h1>
        {roster?.className && <p className="muted" style={{ margin: 0 }}>Class {roster.className}</p>}
        <div className="grid2">
          {roster?.students.map((s) => (
            <button key={s.id} className="btn btn-tall" style={{ justifyContent: 'flex-start', overflow: 'hidden' }}
              onClick={() => { setWho(s); setPin(''); setErr(''); setStep('pin'); }}>
              <span className="avatar">{s.avatar}</span><span className="name">{s.firstName}</span>
            </button>
          ))}
        </div>
        {busy && <p className="center">…</p>}
        <div className="err">{err}</div>
        <button className="link" onClick={() => { lsSet(LS.classCode, null); setRoster(null); setCode(''); setStep('code'); }}>Change class</button>
      </main>
    );
  }

  return (
    <main className="screen student-screen">
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setStep('who')}>← Back</button>
      <div className="center" style={{ textAlign: 'center' }}>
        <div className="avatar" style={{ fontSize: 48 }}>{who?.avatar}</div>
        <div className="title">{who?.firstName}</div>
      </div>
      <div key={wob} className={`dots ${wob ? 'wobble' : ''}`} aria-label={`${pin.length} of 4 digits`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={`dot ${i < pin.length ? 'on' : ''}`} />)}
      </div>
      <div className="err center" role="alert" style={{ textAlign: 'center' }}>{err}</div>
      <div className="keypad" role="group" aria-label="PIN keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="btn" aria-label={d} onClick={() => press(d)}>{d}</button>
        ))}
        <button className="btn" aria-label="backspace" onClick={() => press('back')}>⌫</button>
        <button className="btn" aria-label="0" onClick={() => press('0')}>0</button>
        <button className="btn btn-primary" aria-label="go" disabled={pin.length < 4} onClick={() => press('ok')}>✔</button>
      </div>
    </main>
  );
}
