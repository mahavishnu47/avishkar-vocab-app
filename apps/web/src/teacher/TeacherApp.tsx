/**
 * Teacher lane entry (default export, lazy-loaded). OWNER: Lane D (teacher UI).
 * Nested routes (relative to /teacher): login, classes, classes/:classId/{roster,cards,words,dashboard,leaderboard,analytics},
 * students/:studentId - see docs/UI_SPEC.md section 4.
 */
import { Route, Routes } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return (
    <main className="teacher screen">
      <h1>Teacher: {name} (stub)</h1>
    </main>
  );
}

export default function TeacherApp() {
  return (
    <Routes>
      <Route path="login" element={<Placeholder name="login" />} />
      <Route path="*" element={<Placeholder name="classes" />} />
    </Routes>
  );
}
