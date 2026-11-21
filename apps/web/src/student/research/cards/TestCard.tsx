import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudentAssessmentCurrentRes, StudentHomeRes } from '@shabd/core';
import { assessmentApi } from '../../../shared/research/assessment-api.ts';

/** Home card: only shows while a test window is open for the class (and the child has not finished it). */
export function TestCard(_props: { home: StudentHomeRes }) {
  const nav = useNavigate();
  const [cur, setCur] = useState<StudentAssessmentCurrentRes['assessment']>(null);
  useEffect(() => {
    let live = true;
    assessmentApi.current().then((r) => { if (live) setCur(r.assessment); }, () => { /* offline or no test: show nothing */ });
    return () => { live = false; };
  }, []);
  if (!cur || cur.attempt === 'submitted') return null;
  return (
    <section className="card stack" aria-label="Word test" style={{ textAlign: 'center' }}>
      <div className="title" style={{ fontSize: 22 }}>📝 Word Test</div>
      <p className="muted">Your teacher has opened a test.</p>
      <button className="btn btn-write btn-block btn-tall" onClick={() => nav('/test')}>{cur.attempt === 'in_progress' ? 'Continue the test ▶' : 'Start the test ▶'}</button>
    </section>
  );
}
