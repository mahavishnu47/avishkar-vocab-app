import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../shared/api.ts';
import { errMsg } from './ui.tsx';

export function Login() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (creating && password.length < 8) { setError('Password needs 8 or more characters'); return; }
    setBusy(true);
    try {
      const res = creating
        ? await api.teacherRegister({ name: name.trim(), email: email.trim(), password, inviteCode: invite.trim() })
        : await api.teacherLogin({ email: email.trim(), password });
      setToken(res.token);
      navigate('/teacher', { replace: true });
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <main className="teacher screen t-login">
      <h1 className="title">🦜 Shabd Mitra · Teacher</h1>
      <form className="card stack" onSubmit={submit}>
        <h2 className="t-h2">{creating ? 'Create account' : 'Log in'}</h2>
        {creating && (
          <label className="t-field">Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label className="t-field">Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="t-field">Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            autoComplete={creating ? 'new-password' : 'current-password'} />
        </label>
        {creating && (
          <label className="t-field">Invite code (if your school gave you one)
            <input value={invite} onChange={(e) => setInvite(e.target.value)} />
          </label>
        )}
        {error && <div className="t-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : creating ? 'Create account' : 'Log in'}</button>
        <button type="button" className="btn t-link" onClick={() => { setCreating(!creating); setError(null); }}>
          {creating ? 'I already have an account' : 'Create account'}
        </button>
      </form>
    </main>
  );
}
