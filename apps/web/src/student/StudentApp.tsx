/**
 * Student lane entry. OWNER: Lane C (student UI). Nested routes (relative to '/'):
 *   /login  /  /play  /summary  /leaderboard   - see docs/UI_SPEC.md section 3.
 * Append ?mock=1 once to run against the in-browser mock server (student/dev-mock.ts).
 */
import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { startOutbox } from '../shared/outbox.ts';
import { Home } from './Home.tsx';
import { Leaderboard } from './Leaderboard.tsx';
import { Login } from './Login.tsx';
import { Play } from './Play.tsx';
import { Summary } from './Summary.tsx';

function wantsMock(): boolean {
  try {
    if (new URLSearchParams(location.search).get('mock') === '1') sessionStorage.setItem('shabd.mock', '1');
    return sessionStorage.getItem('shabd.mock') === '1';
  } catch { return false; }
}

export function StudentApp() {
  const [ready, setReady] = useState(() => !wantsMock());
  useEffect(() => {
    if (ready) startOutbox(); // after the optional mock is installed, so nothing hits the real API in mock mode
    else void import('./dev-mock.ts').then((m) => { m.installMock(); setReady(true); });
  }, [ready]);
  if (!ready) return <div className="screen center">Loading…</div>;
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="play" element={<Play />} />
      <Route path="summary" element={<Summary />} />
      <Route path="leaderboard" element={<Leaderboard />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
