import { useEffect, useState } from 'react';
import type { StudentHomeRes, StudyDayRes } from '@shabd/core';
import { wordPlanApi } from '../../../shared/research/wordplan-api.ts';

export function restMessage(r: StudyDayRes): { title: string; body: string } | null {
  switch (r.reason) {
    case 'weekend': return { title: 'No new words today', body: 'Come back on Monday!' };
    case 'holiday': return { title: 'No new words today', body: 'It is a holiday. Come back on the next school day!' };
    case 'not_started': return { title: 'Not yet', body: 'Your word adventure starts soon. Come back on the first school day!' };
    case 'finished': return { title: 'Great job!', body: 'You finished all the study days. Thank you!' };
    case 'comparison': return { title: 'No new words today', body: 'Your teacher will tell you when there is a test.' };
    default: return null;
  }
}

/** Home card: shown only on rest days (weekend, holiday, before start, after the last day) and for comparison classes. */
export function StudyDayCard(_props: { home: StudentHomeRes }) {
  const [day, setDay] = useState<StudyDayRes | null>(null);
  useEffect(() => {
    let live = true;
    wordPlanApi.studyDay().then((r) => { if (live) setDay(r); }, () => { /* offline: show nothing */ });
    return () => { live = false; };
  }, []);
  const msg = day ? restMessage(day) : null;
  if (!msg) return null;
  return (
    <section className="card stack" aria-label="Rest day" style={{ textAlign: 'center' }}>
      <div className="title" style={{ fontSize: 22 }}>😴 {msg.title}</div>
      <p className="muted">{msg.body}</p>
    </section>
  );
}
