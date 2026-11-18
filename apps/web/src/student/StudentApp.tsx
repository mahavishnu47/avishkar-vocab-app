/**
 * Student lane entry. OWNER: Lane C (student UI). Nested routes (relative to '/'):
 *   /login  /  /play  /summary  /leaderboard   - see docs/UI_SPEC.md section 3.
 */
import { Route, Routes } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return (
    <main className="screen center">
      <h1 className="title">Shabd Mitra 🦜</h1>
      <p>Student screen: {name} (stub)</p>
      <a className="btn btn-primary" href="/teacher">Teacher login</a>
    </main>
  );
}

export function StudentApp() {
  return (
    <Routes>
      <Route path="login" element={<Placeholder name="login" />} />
      <Route path="play" element={<Placeholder name="play" />} />
      <Route path="summary" element={<Placeholder name="summary" />} />
      <Route path="leaderboard" element={<Placeholder name="leaderboard" />} />
      <Route path="*" element={<Placeholder name="home" />} />
    </Routes>
  );
}
