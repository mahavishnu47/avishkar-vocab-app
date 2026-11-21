import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../shared/api.ts';
import { ScreenHead } from './common.tsx';
import { getLastLink, markChosen, profilesByRecent, removeProfile, setActive, type Profile } from './profiles.ts';

/** /who - "Who's playing?" for shared phones. */
export function WhoIsPlaying() {
  const nav = useNavigate();
  const [list, setList] = useState<Profile[]>(profilesByRecent());
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<Profile | null>(null);

  if (list.length === 0) return <Navigate to="/" replace />;

  const pick = (p: Profile) => {
    if (edit) { setConfirm(p); return; }
    if (p.token) { setActive(p.studentId); markChosen(); nav('/', { replace: true }); return; }
    nav(p.classCode ? `/j/${p.classCode}/pin/${p.studentId}` : '/login', { state: { from: 'who', student: { id: p.studentId, firstName: p.firstName, avatar: p.avatar, rollNo: 0 } } });
  };
  const remove = (p: Profile) => {
    if (p.token) void api.withToken(p.token).logout('student').catch(() => {});
    removeProfile(p.studentId);
    setConfirm(null);
    setList(profilesByRecent());
  };

  if (confirm) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 64 }}>{confirm.avatar}</div>
        <p className="title" style={{ textAlign: 'center' }}>Remove {confirm.firstName} from this phone?</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => remove(confirm)}>Yes, remove</button>
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
            {!p.token && <span className="badge-key" aria-label="needs your PIN">🔑</span>}
            {edit && <span className="badge-x" aria-label="Remove from this phone">✕</span>}
          </button>
        ))}
      </div>
      <button className="btn btn-block btn-tall" onClick={() => nav(getLastLink())}>+ Add a player</button>
      <button className="link" style={{ alignSelf: 'center' }} onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Edit'}</button>
    </main>
  );
}
