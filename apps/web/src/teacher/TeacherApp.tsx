/**
 * Teacher lane entry (default export, lazy-loaded). OWNER: Lane D (teacher UI).
 * Routes (relative to /teacher): login, join[/:code], reset/:code, (index) Home, classes/new, classes/:classId/{students/add,share}, classes/:classId/{roster,cards,words,dashboard,leaderboard,analytics},
 * students/:studentId - see docs/UI_SPEC.md section 4.
 * Add ?mock=1 to the URL to run against an in-browser mock instead of the server (?mock=0 turns it off).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from '../shared/api.ts';
import { loginPath } from './ui.tsx';
import './teacher.css';
import { Analytics } from './Analytics.tsx';
import { AddStudents } from './AddStudents.tsx';
import { Cards } from './Cards.tsx';
import { Dashboard } from './Dashboard.tsx';
import { Home } from './Home.tsx';
import { Join } from './Join.tsx';
import { Leaderboard } from './Leaderboard.tsx';
import { Login } from './Login.tsx';
import { NewClass } from './NewClass.tsx';
import { ResetPassword } from './ResetPassword.tsx';
import { Roster } from './Roster.tsx';
import { Share } from './Share.tsx';
import { StudentDetail } from './StudentDetail.tsx';
import { Words } from './Words.tsx';
import StudyPages from './research/StudyPages.tsx';
import WordPlan from './research/WordPlan.tsx';
import Assessments from './research/Assessments.tsx';
import Authenticity from './research/Authenticity.tsx';
import Progress from './research/Progress.tsx';
import Results from './research/Results.tsx';
import Instruments from './research/Instruments.tsx';

function Guard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'out'>(getToken('staff') ? 'checking' : 'out');
  useLocation(); // re-render on navigation so the ?next= target is current
  useEffect(() => {
    if (state !== 'checking') return;
    api.me('staff').then(
      (m) => setState(m.role === 'teacher' ? 'ok' : 'out'),
      (e) => { if (e?.status === 401) setToken('staff', null); setState(e?.status === 401 ? 'out' : 'ok'); },
    );
  }, [state]);
  if (state === 'out') return <Navigate to={loginPath()} replace />;
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
      if (new URLSearchParams(window.location.search).get('mock') === '1' && !getToken('staff')) setToken('staff', 'mock-token');
      setReady(true);
    });
  }, [ready]);
  if (!ready) return <main className="teacher screen"><p className="muted">Loading mock…</p></main>;
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="join" element={<Join />} />
      <Route path="join/:code" element={<Join />} />
      <Route path="reset/:code" element={<ResetPassword />} />
      <Route path="classes/new" element={<Guard><NewClass /></Guard>} />
      <Route path="classes/:classId/students/add" element={<Guard><AddStudents /></Guard>} />
      <Route path="classes/:classId/share" element={<Guard><Share /></Guard>} />
      <Route path="classes/:classId/roster" element={<Guard><Roster /></Guard>} />
      <Route path="classes/:classId/cards" element={<Guard><Cards /></Guard>} />
      <Route path="classes/:classId/words" element={<Guard><Words /></Guard>} />
      <Route path="classes/:classId/dashboard" element={<Guard><Dashboard /></Guard>} />
      <Route path="classes/:classId/leaderboard" element={<Guard><Leaderboard /></Guard>} />
      <Route path="classes/:classId/analytics" element={<Guard><Analytics /></Guard>} />
      <Route path="study/*" element={<Guard><StudyPages /></Guard>} />
      <Route path="study/:studyId/words" element={<Guard><WordPlan /></Guard>} />
      <Route path="study/:studyId/results/*" element={<Guard><Results /></Guard>} />
      <Route path="study/:studyId/instruments/*" element={<Guard><Instruments /></Guard>} />
      <Route path="classes/:classId/tests/*" element={<Guard><Assessments /></Guard>} />
      <Route path="classes/:classId/authenticity" element={<Guard><Authenticity /></Guard>} />
      <Route path="classes/:classId/progress" element={<Guard><Progress /></Guard>} />
      <Route path="students/:studentId" element={<Guard><StudentDetail /></Guard>} />
      <Route path="*" element={<Guard><Home /></Guard>} />
    </Routes>
  );
}
