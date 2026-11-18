/**
 * Top-level router. OWNER: integration (Wave 2). Lanes must NOT edit this file in Wave 1;
 * each lane does its own nested routing inside its entry component.
 *   /teacher/*  -> teacher lane (apps/web/src/teacher/TeacherApp.tsx)
 *   /*          -> student lane (apps/web/src/student/StudentApp.tsx)
 */
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { StudentApp } from './student/StudentApp.tsx';

// Teacher UI is code-split so students never download it.
const TeacherApp = lazy(() => import('./teacher/TeacherApp.tsx'));

export function App() {
  return (
    <Suspense fallback={<div className="screen center">Loading…</div>}>
      <Routes>
        <Route path="/teacher/*" element={<TeacherApp />} />
        <Route path="/*" element={<StudentApp />} />
      </Routes>
    </Suspense>
  );
}
