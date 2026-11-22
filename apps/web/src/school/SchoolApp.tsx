/**
 * School admin app (routes under /school/*). Add ?mock=1 to run against an in-browser mock (?mock=0 turns it off).
 * Guard: a staff token whose teacher has role school_admin.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { Teacher } from '@shabd/core';
import { api, getToken, setToken } from '../shared/api.ts';
import './school.css';
import { SchoolCtx } from './ctx.ts';
import Setup from './Setup.tsx';
import { mockRequested } from './util.ts';

const Progress = lazy(() => import('./Progress.tsx'));
const Teachers = lazy(() => import('./Teachers.tsx'));
const Classes = lazy(() => import('./Classes.tsx'));
const Settings = lazy(() => import('./Settings.tsx'));

type State = { s: 'checking' } | { s: 'out' } | { s: 'notAdmin' } | { s: 'ok'; me: Teacher; schoolName: string };

function Guard({ children }: { children: (me: Teacher, schoolName: string) => ReactNode }) {
  const [st, setSt] = useState<State>(getToken('staff') ? { s: 'checking' } : { s: 'out' });
  useEffect(() => {
    if (!getToken('staff')) { setSt({ s: 'out' }); return; }
    let alive = true;
    api.me('staff').then(
      (r) => { if (alive) setSt(r.role === 'teacher' && r.teacher.role === 'school_admin' ? { s: 'ok', me: r.teacher, schoolName: r.school.name } : { s: 'notAdmin' }); },
      () => { if (alive) setSt({ s: 'out' }); },
    );
    return () => { alive = false; };
  }, []);
  const loc = useLocation();
  if (st.s === 'out') return <Navigate to={`/teacher/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (st.s === 'checking') return <main className="teacher screen"><p className="muted">Loading…</p></main>;
  if (st.s === 'notAdmin') {
    return (
      <main className="teacher screen t-login">
        <h1 className="title">This page is for school admins</h1>
        <Link className="btn btn-primary" to="/teacher">Go to my classes</Link>
      </main>
    );
  }
  return <>{children(st.me, st.schoolName)}</>;
}

const SCHOOL_LEAD: Record<string,[string,string]> = {
  "/school": ["School progress", "How every class in your school is doing this week."],
  "/school/teachers": ["Teachers", "Invite teachers, reset passwords and turn accounts on or off."],
  "/school/classes": ["Classes", "All classes in your school. Change the teacher or archive a class."],
  "/school/settings": ["School settings", "School name, student link, poster and recent activity."],
};

function Shell({ me, schoolName }: { me: Teacher; schoolName: string }) {
  const navigate = useNavigate();
  const logout = async () => { try { await api.logout('staff'); } catch { /* ignore */ } setToken('staff', null); navigate('/teacher/login'); };
  const { pathname } = useLocation();
  const lead = SCHOOL_LEAD[pathname.replace(/\/$/, '')];
  useEffect(() => { document.title = (lead ? lead[0] + ' · ' : '') + schoolName + ' · WordWise'; }, [lead, schoolName]);
  return (
    <SchoolCtx.Provider value={{ me, schoolName }}>
      <main className="teacher screen t-page s-shell">
        <nav className="t-nav no-print" aria-label="School admin">
          <span className="t-brand">🦜 {schoolName}</span>
          <NavLink to="/school" end>Progress</NavLink>
          <NavLink to="/school/teachers">Teachers</NavLink>
          <NavLink to="/school/classes">Classes</NavLink>
          <NavLink to="/school/settings">Settings</NavLink>
          <Link to="/teacher">Teacher view</Link>
          <button className="btn t-logout" onClick={logout}>Log out</button>
        </nav>
        {lead && <p className="muted t-lead">{lead[1]}</p>}
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Routes>
            <Route index element={<Progress />} />
            <Route path="teachers" element={<Teachers />} />
            <Route path="classes" element={<Classes />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/school" replace />} />
          </Routes>
        </Suspense>
      </main>
    </SchoolCtx.Provider>
  );
}

export default function SchoolApp() {
  const [ready, setReady] = useState(!mockRequested('school.mock'));
  useEffect(() => {
    if (ready) return;
    import('./dev-mock.ts').then((m) => {
      m.installMock();
      if (new URLSearchParams(window.location.search).get('mock') === '1' && !getToken('staff')) setToken('staff', 'mock-token');
      setReady(true);
    });
  }, [ready]);
  if (!ready) return <main className="teacher screen"><p className="muted">Loading mock…</p></main>;
  return (
    <Routes>
      <Route path="setup/:code" element={<Setup />} />
      <Route path="*" element={<Guard>{(me, name) => <Shell me={me} schoolName={name} />}</Guard>} />
    </Routes>
  );
}
