/**
 * Teacher lane entry (default export, lazy-loaded). OWNER: Lane D (teacher UI).
 * Routes (relative to /teacher): login, (index) classes, classes/:classId/{roster,cards,words,dashboard,leaderboard,analytics},
 * students/:studentId - see docs/UI_SPEC.md section 4.
 * Add ?mock=1 to the URL to run against an in-browser mock instead of the server (?mock=0 turns it off).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, getToken, setToken } from '../shared/api.ts';
import './teacher.css';
import { Analytics } from './Analytics.tsx';
import { Cards } from './Cards.tsx';
import { Classes } from './Classes.tsx';
import { Dashboard } from './Dashboard.tsx';
import { Leaderboard } from './Leaderboard.tsx';
import { Login } from './Login.tsx';
import { Roster } from './Roster.tsx';
import { StudentDetail } from './StudentDetail.tsx';
import { Words } from './Words.tsx';

function Guard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'out'>(getToken() ? 'checking' : 'out');
  useEffect(() => {
    if (state !== 'checking') return;
    api.me().then(
      (m) => setState(m.role === 'teacher' ? 'ok' : 'out'),
      (e) => { if (e?.status === 401) setToken(null); setState(e?.status === 401 ? 'out' : 'ok'); },
    );
  }, [state]);
  if (state === 'out') return <Navigate to="/teacher/login" replace />;
  if (state === 'checking') return <main className="teacher screen"><p className="muted">Loading…</p></main>;
  return <>{children}</>;
}

function mockRequested(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('mock');
    if (q === '1') sessionStorage.setItem('teacher.mock', '1');
    if (q === '0') sessionStorage.removeItem('teacher.mock');
    return sessionStorage.getItem('teacher.mock') === '1';
  } catch { return false; }
}

export default function TeacherApp() {
  const [ready, setReady] = useState(!mockRequested());
  useEffect(() => {
    if (ready) return;
    import('./dev-mock.ts').then((m) => {
      m.installMock();
      // opening the app with ?mock=1 skips the login form (handy for demos and screenshots)
      if (new URLSearchParams(window.location.search).get('mock') === '1' && !getToken()) setToken('mock-token');
      setReady(true);
    });
  }, [ready]);
  if (!ready) return <main className="teacher screen"><p className="muted">Loading mock…</p></main>;
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="classes/:classId/roster" element={<Guard><Roster /></Guard>} />
      <Route path="classes/:classId/cards" element={<Guard><Cards /></Guard>} />
      <Route path="classes/:classId/words" element={<Guard><Words /></Guard>} />
      <Route path="classes/:classId/dashboard" element={<Guard><Dashboard /></Guard>} />
      <Route path="classes/:classId/leaderboard" element={<Guard><Leaderboard /></Guard>} />
      <Route path="classes/:classId/analytics" element={<Guard><Analytics /></Guard>} />
      <Route path="students/:studentId" element={<Guard><StudentDetail /></Guard>} />
      <Route path="*" element={<Guard><Classes /></Guard>} />
    </Routes>
  );
}
