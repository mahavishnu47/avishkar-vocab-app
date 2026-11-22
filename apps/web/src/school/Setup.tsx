/** /school/setup/:code - the principal activates a one-time setup link. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { normalizeCode } from '@shabd/core';
import { api, setToken } from '../shared/api.ts';
import { useLoad } from './hooks.ts';
import { errMsg } from './util.ts';

export const EXPIRED = 'This link has expired or was already used. Ask WordWise for a new one.';

export default function Setup() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const clean = normalizeCode(code);
  const info = useLoad(() => api.inviteInfo(clean), [clean]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (info.loading) return <main className="teacher screen t-login"><p className="muted">Loading…</p></main>;
  if (info.error || !info.data || info.data.kind !== 'school_admin') {
    return (
      <main className="teacher screen t-login">
        <h1 className="title">🦜 WordWise</h1>
        <p className="t-error" role="alert">{info.error && !/not|expired|invalid/i.test(info.error) ? info.error : EXPIRED}</p>
        <Link to="/" className="btn btn-block">Go to home</Link>
      </main>
    );
  }

  const valid = name.trim().length > 0 && /.+@.+\..+/.test(email.trim()) && password.length >= 8;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api.schoolSetup({ code: clean, name: name.trim(), email: email.trim(), password });
      setToken('staff', res.token);
      navigate('/school', { replace: true });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <main className="teacher screen t-login">
      <h1 className="title">Set up {info.data.schoolName}</h1>
      <p className="muted">This takes 1 minute. You will be the school admin.</p>
      <form className="stack card" onSubmit={submit}>
        <label className="t-field">Your name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="t-field">Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
        </label>
        <label className="t-field">Password (8 or more characters)
          <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="row"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
        {error && <p className="t-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={!valid || busy}>Create my account</button>
      </form>
    </main>
  );
}
