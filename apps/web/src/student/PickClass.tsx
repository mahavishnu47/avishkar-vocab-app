import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { JoinSchoolRes } from '@shabd/core';
import { api } from '../shared/api.ts';
import { kidError, ScreenHead } from './common.tsx';
import { setLastLink } from './profiles.ts';

export function sortClasses(c: JoinSchoolRes['classes']): JoinSchoolRes['classes'] {
  return [...c].sort((a, b) => a.standard - b.standard || a.division.localeCompare(b.division));
}

/** /s/:schoolCode: pick your class. */
export function PickClass() {
  const { schoolCode = '' } = useParams();
  const nav = useNavigate();
  const [res, setRes] = useState<JoinSchoolRes | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setLastLink(`/s/${schoolCode}`);
    api.joinSchool(schoolCode).then((r) => { if (live) setRes(r); }).catch((e) => { if (live) setErr(kidError(e)); });
    return () => { live = false; };
  }, [schoolCode]);

  if (err) {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 72 }}>🤔</div>
        <p className="title" style={{ textAlign: 'center' }}>{err}</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => nav('/login')}>Type a class code</button>
      </main>
    );
  }
  if (!res) return <main className="screen center student-screen"><div className="mitra-bird spin">🦜</div></main>;
  const classes = sortClasses(res.classes);
  return (
    <main className="screen student-screen">
      <ScreenHead onBack={() => nav('/')} say="Pick your class" />
      <h1 className="title">Pick your class</h1>
      <p className="muted" style={{ margin: 0 }}>{res.schoolName}</p>
      {classes.length === 0 && <p className="center" style={{ textAlign: 'center' }}>No classes yet. Ask your teacher 🙂</p>}
      <div className="grid2">
        {classes.map((c) => (
          <button key={c.classCode} className="btn btn-tall class-tile" onClick={() => nav(`/j/${c.classCode}`)}>{c.name}</button>
        ))}
      </div>
    </main>
  );
}
