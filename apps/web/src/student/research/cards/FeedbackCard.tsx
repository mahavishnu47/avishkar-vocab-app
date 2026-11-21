import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudentHomeRes, StudentFeedbackRes } from '@shabd/core';
import { instrumentsApi } from '../../../shared/research/instruments-api.ts';

/** Home card: only while the questionnaire is open and this child has not answered everything yet. */
export function FeedbackCard(_props: { home: StudentHomeRes }) {
  const nav = useNavigate();
  const [fb, setFb] = useState<StudentFeedbackRes | null>(null);
  useEffect(() => {
    let live = true;
    instrumentsApi.studentFeedback().then((r) => { if (live) setFb(r); }, () => { /* not in a study, or offline: show nothing */ });
    return () => { live = false; };
  }, []);
  if (!fb || !fb.open || fb.answers.every((a) => a !== null)) return null;
  return (
    <section className="card stack" aria-label="Tell us what you think" style={{ textAlign: 'center' }}>
      <div className="title" style={{ fontSize: 22 }}>💬 Tell us what you think</div>
      <p className="muted">Five quick questions about the app.</p>
      <button className="btn btn-write btn-block btn-tall" onClick={() => nav('/feedback')}>Answer now ▶</button>
    </section>
  );
}
