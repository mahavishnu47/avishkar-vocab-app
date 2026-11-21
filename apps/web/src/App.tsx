/**
 * Top-level router. CONTRACT FILE (frozen by O1; docs/ONBOARDING_SPEC.md 5.1). Lanes do their own nested routing:
 *   /teacher/*  -> teacher lane  (teacher/TeacherApp.tsx, lazy)   /t/:code -> /teacher/join/:code   /r/:code -> /teacher/reset/:code
 *   /school/*   -> school lane   (school/SchoolApp.tsx, lazy)     /a/:code -> /school/setup/:code
 *   /admin      -> super admin   (admin/AdminApp.tsx, lazy)
 *   /*          -> student lane  (student/StudentApp.tsx): /, /j/:classCode, /s/:schoolCode, /login, /who, /welcome, /play ...
 */
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { StudentApp } from './student/StudentApp.tsx';

// Teacher, school and admin UIs are code-split so students never download them.
const TeacherApp = lazy(() => import('./teacher/TeacherApp.tsx'));
const SchoolApp = lazy(() => import('./school/SchoolApp.tsx'));
const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));

function Redirect({ to }: { to: (code: string) => string }) {
  const { code = '' } = useParams();
  return <Navigate to={to(code)} replace />;
}

export function App() {
  return (
    <Suspense fallback={<div className="screen center">Loading…</div>}>
      <Routes>
        <Route path="/t/:code" element={<Redirect to={(c) => `/teacher/join/${c}`} />} />
        <Route path="/r/:code" element={<Redirect to={(c) => `/teacher/reset/${c}`} />} />
        <Route path="/a/:code" element={<Redirect to={(c) => `/school/setup/${c}`} />} />
        <Route path="/teacher/*" element={<TeacherApp />} />
        <Route path="/school/*" element={<SchoolApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<StudentApp />} />
      </Routes>
    </Suspense>
  );
}
