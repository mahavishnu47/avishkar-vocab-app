import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isValidInviteCode, normalizeCode } from '@shabd/core';
import { api, ApiRequestError, setToken } from '../shared/api.ts';
import { errMsg, PasswordField } from './ui.tsx';

const BAD_CODE = 'This code is not valid. Ask your school admin for a new one.';

/** Teacher signup with a school invite: /t/:code -> /teacher/join/:code (or /teacher/join and type the code). */
export function Join() {
  const navigate = useNavigate();
  const { code: urlCode } = useParams();
  const [codeInput, setCodeInput] = useState(urlCode ?? '');
  const code = normalizeCode(codeInput);
  const [school, setSchool] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState(false);

  // look up the school name as soon as the code is complete
  useEffect(() => {
    setSchool(null); setCodeError(null);
    if (!isValidInviteCode(code)) { if (urlCode) setCodeError(BAD_CODE); return; }
    let live = true;
    api.inviteInfo(code).then(
      (i) => { if (!live) return; if (i.kind === 'password_reset') setCodeError(BAD_CODE); else setSchool(i.schoolName); },
      (e) => { if (live) setCodeError(e instanceof ApiRequestError && !e.isNetwork ? BAD_CODE : errMsg(e)); },
    );
    return () => { live = false; };
  }, [code, urlCode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setEmailTaken(false);
    if (!isValidInviteCode(code)) { setCodeError(BAD_CODE); return; }
    if (password.length < 8) { setError('Password needs 8 or more characters.'); return; }
    setBusy(true);
    try {
      const res = await api.teacherRegister({ inviteCode: code, name: name.trim(), email: email.trim(), password });
      setToken('staff', res.token);
      navigate('/teacher', { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) { setEmailTaken(true); setError('This email is already registered. Log in instead.'); }
      else if (err instanceof ApiRequestError && err.status === 404) setCodeError(BAD_CODE);
      else setError(errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <main className="teacher screen t-login">
      <h1 className="title">🦜 {school ? <>Join <b>{school}</b></> : 'Join your school'}</h1>
      <form className="card stack" onSubmit={submit}>
        {!urlCode || codeError ? (
          <label className="t-field">School code
            <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="ABCD-EFGH" autoCapitalize="characters"
              autoComplete="off" required />
          </label>
        ) : null}
        {codeError && <div className="t-error" role="alert">{codeError}</div>}
        <label className="t-field">Your name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={80} />
        </label>
        <label className="t-field">Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <PasswordField value={password} onChange={setPassword} autoComplete="new-password" hint="8 or more characters" />
        {error && (
          <div className="t-error" role="alert">
            {error}{emailTaken && <> <Link to="/teacher/login">Log in</Link></>}
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || !!codeError}>{busy ? 'Please wait…' : 'Join school'}</button>
      </form>
      <p className="t-foot">Already joined? <Link to="/teacher/login">Log in</Link></p>
    </main>
  );
}
