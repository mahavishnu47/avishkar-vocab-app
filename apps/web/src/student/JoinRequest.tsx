import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { JoinRequestStatus } from '@shabd/core';
import { api, ApiRequestError } from '../shared/api.ts';
import { kidError, ScreenHead } from './common.tsx';

export const POLL_MS = 10_000;

interface Saved { requestId: number; secret: string; firstName: string }
const keyOf = (classCode: string) => `shabd.joinreq.${classCode.toUpperCase()}`;
function load(classCode: string): Saved | null {
  try { const v = localStorage.getItem(keyOf(classCode)); return v ? (JSON.parse(v) as Saved) : null; } catch { return null; }
}
function save(classCode: string, s: Saved | null): void {
  try { if (s) localStorage.setItem(keyOf(classCode), JSON.stringify(s)); else localStorage.removeItem(keyOf(classCode)); } catch { /* private mode */ }
}

function askError(e: unknown): string {
  if (e instanceof ApiRequestError && (e.status === 400 || e.status === 409)) return e.message;
  return kidError(e);
}

/** /j/:classCode/ask - "Not on the list? Ask to join": first name, then wait for the teacher. */
export function JoinRequestPage() {
  const { classCode = '' } = useParams();
  const nav = useNavigate();
  const [saved, setSaved] = useState<Saved | null>(() => load(classCode));
  const [status, setStatus] = useState<JoinRequestStatus>('pending');
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!saved || status !== 'pending') return;
    let live = true;
    const check = () => {
      api.joinRequestStatus(saved.requestId, saved.secret).then((r) => { if (live) setStatus(r.status); }).catch((e) => {
        if (live && e instanceof ApiRequestError && e.status === 404) { save(classCode, null); setSaved(null); }
      });
    };
    check();
    const t = setInterval(check, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [saved, status, classCode]);

  const submit = async () => {
    const rollNo = roll.trim() === '' ? undefined : Number(roll);
    if (rollNo !== undefined && (!Number.isInteger(rollNo) || rollNo < 1)) { setErr('Roll number is a number like 12 🙂'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.requestToJoin(classCode, { firstName: name.trim(), ...(rollNo === undefined ? {} : { rollNo }) });
      const s = { requestId: r.requestId, secret: r.secret, firstName: name.trim() };
      save(classCode, s); setStatus('pending'); setSaved(s);
    } catch (e) { setErr(askError(e)); } finally { setBusy(false); }
  };
  const again = () => { save(classCode, null); setSaved(null); setStatus('pending'); setName(''); setRoll(''); };

  if (saved && status === 'approved') {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 72 }}>🎉</div>
        <h1 className="title" style={{ textAlign: 'center' }}>You are in, {saved.firstName}!</h1>
        <p style={{ textAlign: 'center' }}>Ask your teacher for your PIN, then log in.</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => { save(classCode, null); nav(`/j/${classCode}`, { replace: true }); }}>Log in</button>
      </main>
    );
  }
  if (saved && status === 'rejected') {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 72 }}>🙁</div>
        <h1 className="title" style={{ textAlign: 'center' }}>Not approved</h1>
        <p style={{ textAlign: 'center' }}>Your teacher did not approve this. Please ask your teacher.</p>
        <button className="btn btn-block btn-tall" onClick={again}>Try again</button>
      </main>
    );
  }
  if (saved) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 72 }}>🦜</div>
        <h1 className="title" style={{ textAlign: 'center' }}>Waiting for your teacher 🙂</h1>
        <p style={{ textAlign: 'center' }}>{saved.firstName}, your teacher will see your name. You can close this page and come back.</p>
        <button className="link" onClick={again}>Wrong name? Start again</button>
      </main>
    );
  }
  return (
    <main className="screen student-screen">
      <ScreenHead onBack={() => nav(`/j/${classCode}`)} say="What is your first name?" />
      <h1 className="title">What is your first name?</h1>
      <label htmlFor="jr-name" className="muted">First name only</label>
      <input
        id="jr-name" className="input" style={{ fontSize: 28, padding: 14 }} autoComplete="off" maxLength={30}
        value={name} onChange={(e) => setName(e.target.value)}
      />
      <label htmlFor="jr-roll" className="muted">Roll number (if you know it)</label>
      <input
        id="jr-roll" className="input" inputMode="numeric" autoComplete="off" maxLength={4}
        value={roll} onChange={(e) => setRoll(e.target.value.replace(/\D/g, ''))}
      />
      <div className="err" role="alert">{err}</div>
      <button className="btn btn-primary btn-block btn-tall" disabled={busy || name.trim() === ''} onClick={() => void submit()}>Ask to join</button>
    </main>
  );
}
