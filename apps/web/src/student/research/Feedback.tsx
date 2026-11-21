import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FeedbackAnswer, StudentFeedbackRes } from '@shabd/core';
import { FEEDBACK_ANSWER_LABEL, FEEDBACK_ANSWERS } from '@shabd/core';
import { instrumentsApi } from '../../shared/research/instruments-api.ts';
import { speak, speechSupported } from '../../shared/speech.ts';

const FACE: Record<FeedbackAnswer, string> = { yes: '😀', some: '😐', no: '🙁' };

/** End-of-study questionnaire: one question per screen, read aloud on request, three big buttons. English only, no typing. */
export default function Feedback() {
  const nav = useNavigate();
  const [data, setData] = useState<StudentFeedbackRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(FeedbackAnswer | null)[]>([]);
  const [phase, setPhase] = useState<'ask' | 'saving' | 'done'>('ask');

  useEffect(() => {
    let live = true;
    instrumentsApi.studentFeedback().then(
      (r) => { if (live) { setData(r); setAnswers(r.answers); } },
      () => { if (live) setError('This questionnaire is not available for you.'); },
    );
    return () => { live = false; };
  }, []);

  if (error) return <main className="screen center student-screen"><p>{error}</p><button className="btn btn-primary btn-tall" onClick={() => nav('/')}>Back home</button></main>;
  if (!data) return <main className="screen center student-screen"><p>Loading…</p></main>;
  if (!data.open) return <main className="screen center student-screen"><p>The questions are not open right now.</p><button className="btn btn-primary btn-tall" onClick={() => nav('/')}>Back home</button></main>;
  if (phase === 'done') {
    return (
      <main className="screen center student-screen">
        <div className="title" style={{ fontSize: 28 }}>Thank you! 🌟</div>
        <p>Your answers help your teacher.</p>
        <button className="btn btn-primary btn-tall" onClick={() => nav('/')}>Back home</button>
      </main>
    );
  }

  const item = data.items[idx]!;
  const total = data.items.length;
  const choose = async (a: FeedbackAnswer) => {
    const next = answers.slice();
    next[idx] = a;
    setAnswers(next);
    if (idx + 1 < total) { setIdx(idx + 1); return; }
    setPhase('saving');
    try {
      await instrumentsApi.postFeedback(next.map((ans, i) => ({ itemNo: i + 1, answer: (ans ?? 'some') as FeedbackAnswer })));
      setPhase('done');
    } catch {
      setPhase('ask');
      setError('We could not save your answers. Please ask your teacher.');
    }
  };

  return (
    <main className="screen center student-screen stack">
      <p className="muted">Question {idx + 1} of {total}</p>
      <h1 className="title" style={{ fontSize: 24 }}>{item.text}</h1>
      {speechSupported() && <button className="btn btn-icon small" aria-label="Read the question to me" onClick={() => void speak(item.text)}>🔊</button>}
      <div className="stack" style={{ width: '100%' }}>
        {FEEDBACK_ANSWERS.map((a) => (
          <button key={a} className={`btn btn-block btn-tall ${answers[idx] === a ? 'picked' : ''}`} aria-pressed={answers[idx] === a} disabled={phase === 'saving'} onClick={() => void choose(a)}>
            <span aria-hidden="true" style={{ fontSize: 28 }}>{FACE[a]}</span> {FEEDBACK_ANSWER_LABEL[a]}
          </button>
        ))}
      </div>
      <button className="link" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>◀ Back</button>
    </main>
  );
}
