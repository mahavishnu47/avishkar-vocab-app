/**
 * Student lane entry. OWNER: O3 (student UI). Routes (relative to '/'), docs/ONBOARDING_SPEC.md 5.1:
 *   /  /j/:classCode  /j/:classCode/pin/:studentId  /s/:schoolCode  /login  /who  /welcome  /play  /summary  /leaderboard
 * Append ?mock=1 once to run against the in-browser mock server (student/dev-mock.ts).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { STUDENT_UNAUTHORIZED_EVENT } from '../shared/api.ts';
import { startOutbox } from '../shared/outbox.ts';
import { Landing } from '../landing/Landing.tsx';
import { onStudentUnauthorized } from './common.tsx';
import { Home } from './Home.tsx';
import './InstallPrompt.tsx'; // capture beforeinstallprompt as early as possible
import { JoinPage, PinScreen } from './Join.tsx';
import { JoinRequestPage } from './JoinRequest.tsx';
import { Leaderboard } from './Leaderboard.tsx';
import { Login } from './Login.tsx';
import { PickClass } from './PickClass.tsx';
import { Play } from './Play.tsx';
import { Progress } from './Progress.tsx';
import { getActiveProfile, hasChosen, initProfiles, getProfiles } from './profiles.ts';
import { isStudentDevice, requestPersistentStorage } from '../shared/persist.ts';
import { Summary } from './Summary.tsx';
import { Welcome } from './Welcome.tsx';
import { WhoIsPlaying } from './WhoIsPlaying.tsx';

const TestApp = lazy(() => import('./research/TestApp.tsx'));
const Recall = lazy(() => import('./research/Recall.tsx'));
const Bank = lazy(() => import('./research/Bank.tsx'));
const Feedback = lazy(() => import('./research/Feedback.tsx'));

function wantsMock(): boolean {
  try {
    if (new URLSearchParams(location.search).get('mock') === '1') sessionStorage.setItem('shabd.mock', '1');
    return sessionStorage.getItem('shabd.mock') === '1';
  } catch { return false; }
}

/** `/`: no profiles -> Landing; one -> Home; several -> "Who's playing?" (once per visit). */
function Gate() {
  const n = getProfiles().length;
  // A phone that has had a child on it but lost the saved profile (storage cleared/evicted) says "Welcome back"
  // instead of the three-role chooser meant for strangers (P-1).
  if (n === 0) return isStudentDevice() ? <Navigate to="/login" state={{ welcomeBack: true }} replace /> : <Landing />;
  if (n === 1 || (hasChosen() && getActiveProfile())) return getActiveProfile() ? <Home /> : <Navigate to="/who" replace />;
  return <Navigate to="/who" replace />;
}

export function StudentApp() {
  const nav = useNavigate();
  const [ready, setReady] = useState(() => !wantsMock());
  const [booted] = useState(() => { initProfiles(); if (getProfiles().length > 0) void requestPersistentStorage(); return true; });
  useEffect(() => {
    if (ready) startOutbox(); // after the optional mock is installed, so nothing hits the real API in mock mode
    else void import('./dev-mock.ts').then((m) => { m.installMock(); setReady(true); });
  }, [ready]);
  useEffect(() => {
    const f = () => onStudentUnauthorized(nav);
    window.addEventListener(STUDENT_UNAUTHORIZED_EVENT, f);
    return () => window.removeEventListener(STUDENT_UNAUTHORIZED_EVENT, f);
  }, [nav]);
  if (!ready || !booted) return <div className="screen center">Loading…</div>;
  return (
    <Routes>
      <Route index element={<Gate />} />
      <Route path="j/:classCode" element={<JoinPage />} />
      <Route path="j/:classCode/pin/:studentId" element={<PinScreen />} />
      <Route path="j/:classCode/ask" element={<JoinRequestPage />} />
      <Route path="s/:schoolCode" element={<PickClass />} />
      <Route path="login" element={<Login />} />
      <Route path="who" element={<WhoIsPlaying />} />
      <Route path="welcome" element={<Welcome />} />
      <Route path="play" element={<Play />} />
      <Route path="summary" element={<Summary />} />
      <Route path="leaderboard" element={<Leaderboard />} />
      <Route path="progress" element={<Progress />} />
      <Route path="test/*" element={<Suspense fallback={null}><TestApp /></Suspense>} />
      <Route path="recall" element={<Suspense fallback={null}><Recall /></Suspense>} />
      <Route path="bank" element={<Suspense fallback={null}><Bank /></Suspense>} />
      <Route path="feedback" element={<Suspense fallback={null}><Feedback /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
