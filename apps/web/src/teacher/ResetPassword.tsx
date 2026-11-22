import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { normalizeCode } from '@shabd/core';
import { api, ApiRequestError, setToken } from '../shared/api.ts';
import { errMsg, PasswordField } from './ui.tsx';

/** /r/:code -> /teacher/reset/:code : the admin's reset link lets a teacher choose a new password. */
export function ResetPassword() {
  const navigate = useNavigate();
  const code = normalizeCode(useParams().code ?? '');
  const [info, setInfo] = useState<{ schoolName: string; teacherName?: string } | null>(null);
  const [bad, setBad] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.inviteInfo(code).then(
      (i) => { if (live) { if (i.kind !== 'password_reset') setBad(true); else setInfo(i); } },
      (e) => { if (!live) return; if (e instanceof ApiRequestError && !e.isNetwork) setBad(true); else setError(errMsg(e)); },
    );
    return () => { live = false; };
  }, [code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password needs 8 or more characters.'); return; }
    setBusy(true);
    try {
      const res = await api.passwordReset({ code, password });
      setToken('staff', res.token);
      navigate('/teacher', { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) setBad(true); else setError(errMsg(err));
    } finally { setBusy(false); }
  };

  if (bad) {
    return (
      <main className="teacher screen t-login">
        <h1 className="title">🦜 WordWise</h1>
        <div className="card stack">
          <div className="t-error" role="alert">This link has expired or was already used. Ask your school admin for a new one.</div>
          <Link className="btn" to="/teacher/login">Back to log in</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="teacher screen t-login">
      <h1 className="title">🦜 New password</h1>
      <form className="card stack" onSubmit={submit}>
        <p>{info ? <>Hello{info.teacherName ? ` ${info.teacherName}` : ''}. Choose a new password for <b>{info.schoolName}</b>.</> : 'Choose a new password.'}</p>
        <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint="8 or more characters" />
        {error && <div className="t-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : 'Save password and log in'}</button>
      </form>
    </main>
  );
}
