/**
 * F6 "Yesterday's words challenge" (route /recall): up to 5 quick taps, instant praise, then on to today's words.
 * Gives no XP. Answers are sent one by one (best effort: a failed send never blocks the child).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RecallItem } from '@shabd/core';
import { vocabApi } from '../../shared/research/vocab-api.ts';
import { handleAuthError, TopBar, useRequireToken } from '../common.tsx';

const POS_LABEL: Record<string, string> = { noun: 'Noun (a name)', verb: 'Verb (an action)', adjective: 'Adjective (describes)', adverb: 'Adverb (how, when, where)' };
const PRAISE = ['Great job!', 'Super!', 'Well done!', 'You remembered!', 'Brilliant!'];

export default function Recall() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [items, setItems] = useState<RecallItem[] | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState<{ chosen: string; correct: string; ok: boolean } | null>(null);
  const [right, setRight] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!authed) return;
    let live = true;
    vocabApi.recallToday().then((r) => { if (live) { setItems(r.items); started.current = Date.now(); } },
      (e) => { if (live && !handleAuthError(e, nav)) setError(true); });
    return () => { live = false; };
  }, [authed, nav]);

  const start = <button className="btn btn-primary btn-block btn-tall" onClick={() => nav('/play')}>Start today&apos;s words ▶</button>;
  const home = <button className="btn btn-block" onClick={() => nav('/')}>Back home</button>;

  if (error) return <main className="screen center student-screen"><p>No internet 🙂</p>{start}{home}</main>;
  if (!items) return <main className="screen center student-screen"><div className="mitra-bird">🦜</div><p>Loading…</p></main>;
  if (items.length === 0) {
    return <main className="screen center student-screen stack"><div className="mitra-bird">🦜</div><p>Nothing to revise yet. Let&apos;s learn new words!</p>{start}{home}</main>;
  }
  if (idx >= items.length) {
    return (
      <main className="screen center student-screen stack" aria-label="Challenge finished">
        <div className="mitra-bird">🦜</div>
        <div className="title">You remembered {right} of {items.length}!</div>
        <p className="muted">{right === items.length ? 'Every one. Wow!' : 'Keep going, every try helps you remember.'}</p>
        {start}
        <button className="btn btn-block" onClick={() => nav('/bank')}>My Word Bank</button>
      </main>
    );
  }

  const item = items[idx]!;
  const tap = (chosen: string) => {
    if (shown) return;
    const msElapsed = Math.max(0, Date.now() - started.current);
    // optimistic: the child sees the result once the server (the only judge) answers; if offline, just move on
    vocabApi.recallAnswers([{ clientId: crypto.randomUUID(), itemId: item.itemId, chosen, msElapsed, clientTs: new Date().toISOString() }]).then(
      (r) => {
        const res = r.results[0]!;
        setShown({ chosen, correct: res.correctAnswer, ok: res.isCorrect });
        if (res.isCorrect) setRight((n) => n + 1);
      },
      () => setShown({ chosen, correct: '', ok: false }),
    );
  };
  const next = () => { setShown(null); setIdx((i) => i + 1); started.current = Date.now(); };
  const label = (o: string) => (item.kind === 'pos' ? POS_LABEL[o] ?? o : o);

  return (
    <main className="screen student-screen">
      <TopBar left={<span className="name">Yesterday&apos;s words</span>} right={<span className="chip">{idx + 1} / {items.length}</span>} />
      <section className="card stack">
        <div className="title" style={{ fontSize: 22 }}>{item.prompt}</div>
        <div className="stack" role="group" aria-label="Choices">
          {item.options.map((o) => {
            const cls = shown ? (o === shown.correct ? ' right' : o === shown.chosen ? ' grey' : '') : '';
            return <button key={o} className={`btn option btn-block${cls}`} disabled={!!shown} onClick={() => tap(o)}>{label(o)}</button>;
          })}
        </div>
        {shown && (
          <div className="stack" role="status">
            <p className="title" style={{ fontSize: 20 }}>
              {shown.correct === '' ? 'Saved for later. On we go!' : shown.ok ? PRAISE[idx % PRAISE.length] : `Nice try! It is: ${label(shown.correct)}`}
            </p>
            <button className="btn btn-primary btn-block btn-tall" onClick={next}>{idx + 1 === items.length ? 'Finish ▶' : 'Next ▶'}</button>
          </div>
        )}
      </section>
    </main>
  );
}
