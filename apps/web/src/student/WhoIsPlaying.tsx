import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../shared/api.ts';
import { flush } from '../shared/outbox.ts';
import { kidError, ScreenHead } from './common.tsx';
import { PinPad } from './PinPad.tsx';
import { getActiveId, getLastLink, markChosen, profilesByRecent, removeProfile, saveLogin, setActive, type Profile } from './profiles.ts';

/** Asks for one child's PIN right here (shared phones: nobody gets into or removes another child's profile without it). */
function PinCheck({ profile, onBack, onOk }: { profile: Profile; onBack: () => void; onOk: (r: Awaited<ReturnType<typeof api.studentLogin>>) => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(0);
  const submit = async (pin: string) => {
    setBusy(true); setErr('');
    try { onOk(await api.studentLogin({ classCode: profile.classCode, studentId: profile.studentId, pin })); }
    catch (e) {
      setBad((n) => n + 1);
      if (e instanceof ApiRequestError && e.status === 401) setErr('Try again 💪');
      else setErr(kidError(e));
    } finally { setBusy(false); }
  };
  return (
    <main className="screen student-screen">
      <ScreenHead onBack={onBack} say="Type your PIN" />
      <div className="center" style={{ textAlign: 'center' }}>
        <div className="avatar" style={{ fontSize: 64 }}>{profile.avatar}</div>
        <div className="title">{profile.firstName}</div>
        <p className="muted" style={{ margin: 0 }}>Type your PIN</p>
      </div>
      <PinPad onSubmit={(p) => void submit(p)} disabled={busy} resetKey={bad} wobble={bad > 0 && !busy} />
      <div className="err center" role="alert" style={{ textAlign: 'center' }}>{err}</div>
    </main>
  );
}

/** /who - "Who's playing?" for shared phones. */
export function WhoIsPlaying() {
  const nav = useNavigate();
  const [list, setList] = useState<Profile[]>(profilesByRecent());
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<Profile | null>(null);
  const [pinFor, setPinFor] = useState<{ p: Profile; why: 'switch' | 'remove' } | null>(null);

  if (list.length === 0) return <Navigate to="/" replace />;

  const pick = (p: Profile) => {
    if (edit) { setConfirm(p); return; }
    // Only one child on the phone, or tapping the child who is already signed in: no PIN. Anyone else needs their own PIN.
    if (p.token && (list.length === 1 || getActiveId() === p.studentId)) { setActive(p.studentId); markChosen(); nav('/', { replace: true }); return; }
    if (p.classCode) { setPinFor({ p, why: 'switch' }); return; }
    nav(p.classCode ? `/j/${p.classCode}/pin/${p.studentId}` : '/login', { state: { from: 'who', student: { id: p.studentId, firstName: p.firstName, avatar: p.avatar, rollNo: 0 } } });
  };
  const remove = (p: Profile, freshToken?: string) => {
    if (freshToken) void api.withToken(freshToken).logout('student').catch(() => {});
    if (p.token) void api.withToken(p.token).logout('student').catch(() => {});
    removeProfile(p.studentId);
    setConfirm(null);
    setList(profilesByRecent());
  };

  if (pinFor) {
    const { p, why } = pinFor;
    return (
      <PinCheck profile={p} onBack={() => setPinFor(null)} onOk={(r) => {
        setPinFor(null);
        if (why === 'switch') { saveLogin(r); markChosen(); void flush(); nav('/', { replace: true }); }
        else remove(p, r.token);
      }} />
    );
  }
  if (confirm) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 64 }}>{confirm.avatar}</div>
        <p className="title" style={{ textAlign: 'center' }}>Remove {confirm.firstName} from this phone?</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => { const c = confirm; setConfirm(null); if (c.classCode) setPinFor({ p: c, why: 'remove' }); else remove(c); }}>Yes, remove</button>
        <button className="btn btn-block btn-tall" onClick={() => setConfirm(null)}>No</button>
      </main>
    );
  }
  return (
    <main className="screen student-screen">
      <ScreenHead say="Who's playing?" />
      <h1 className="title">Who's playing? 🦜</h1>
      <div className="grid2">
        {list.map((p) => (
          <button key={p.studentId} className="btn btn-tall who-tile" onClick={() => pick(p)}>
            <span className="avatar" style={{ fontSize: 44 }}>{p.avatar}</span>
            <span className="name">{p.firstName}</span>
            <span className="muted tiny">{p.token ? p.className && `Class ${p.className}` : 'Type your PIN again'}</span>
            {(!p.token || (list.length > 1 && getActiveId() !== p.studentId)) && <span className="badge-key" aria-label="needs your PIN">🔑</span>}
            {edit && <span className="badge-x" aria-label="Remove from this phone">✕</span>}
          </button>
        ))}
      </div>
      <button className="btn btn-block btn-tall" onClick={() => nav(getLastLink())}>+ Add a player</button>
      <button className="link" style={{ alignSelf: 'center' }} onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Edit'}</button>
    </main>
  );
}
