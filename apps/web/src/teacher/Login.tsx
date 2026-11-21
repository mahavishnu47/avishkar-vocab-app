import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../shared/api.ts';
import { errMsg, PasswordField } from './ui.tsx';
import { safeNext } from './util.ts';

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.teacherLogin({ email: email.trim(), password });
      setToken('staff', res.token);
      navigate(next ?? '/teacher', { replace: true });
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <main className="teacher screen t-login">
      <h1 className="title">🦜 Shabd Mitra · Teacher</h1>
      <form className="card stack" onSubmit={submit}>
        <h2 className="t-h2">Log in</h2>
        <label className="t-field">Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <div className="t-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : 'Log in'}</button>
        <p className="muted t-hint">Forgot password? Ask your school admin for a reset link.</p>
      </form>
      <p className="t-foot">New teacher? <Link to="/teacher/join">Join your school</Link></p>
    </main>
  );
}
