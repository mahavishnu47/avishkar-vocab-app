import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { normalizeCode } from '@shabd/core';
import { api, ApiRequestError } from '../shared/api.ts';
import { ScreenHead } from './common.tsx';

/** /login - fallback with no link: type the class code from the card (field id #cc), then the same name, PIN, welcome steps. */
export function Login() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async () => {
    const c = normalizeCode(code);
    if (c.length < 4) return;
    setBusy(true); setErr('');
    try {
      const join = await api.joinClass(c);
      nav(`/j/${join.classRoom.classCode}`, { state: { join } });
    } catch (e) {
      const nf = e instanceof ApiRequestError && (e.status === 404 || e.status === 400);
      setErr(e instanceof ApiRequestError && e.status === 429 ? e.message
        : nf ? "We can't find that class. Check the code 🙂" : 'No internet. Try again 🙂');
    } finally { setBusy(false); }
  };

  return (
    <main className="screen center student-screen">
      <ScreenHead onBack={() => nav('/')} say="Type your class code" />
      <div className="mitra-bird" style={{ fontSize: 72 }}>🦜</div>
      <h1 className="title">Type your class code</h1>
      <form className="stack" style={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); void next(); }}>
        <label htmlFor="cc" className="muted">Class code (6 letters, from your card)</label>
        <input id="cc" className="code-input" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off"
          autoCorrect="off" spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <div className="card-hint" aria-hidden="true">
          <div className="mini-card"><span>🏫 Class 5A</span><b>K7Q2MX</b><span>PIN ••••</span></div>
          <span className="muted tiny">Your code is on your card</span>
        </div>
        <div className="err" role="alert">{err}</div>
        <button className="btn btn-primary btn-block btn-tall" disabled={busy || code.length < 4}>{busy ? '…' : 'Next ▶'}</button>
      </form>
      <a className="link" href="/teacher/login">Teacher? Log in here</a>
    </main>
  );
}
