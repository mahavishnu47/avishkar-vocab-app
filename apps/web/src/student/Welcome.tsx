import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { speak, stopSpeaking } from '../shared/speech.ts';
import { getActiveId } from './profiles.ts';

export const WELCOME_CARDS = [
  { cls: 'stage-spell', icon: '🔵', title: 'Listen and spell', line: 'Hear the word. Type it.' },
  { cls: 'stage-learn', icon: '🟢', title: 'Learn the meaning', line: 'Read it. Pick the right meaning.' },
  { cls: 'stage-write', icon: '🟣', title: 'Write a sentence', line: 'Use the word your way.' },
] as const;

/** /welcome: three cards, about 30 seconds. Shown after a child's first login; reopen from Home ("How to play"). */
export function Welcome() {
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const card = WELCOME_CARDS[i];
  const last = i === WELCOME_CARDS.length - 1;
  const done = () => { stopSpeaking(); nav('/', { replace: true }); };

  useEffect(() => {
    if (getActiveId() === null) nav('/', { replace: true });
  }, [nav]);
  useEffect(() => {
    void speak(`${card.title}. ${card.line}${last ? ' 5 words a day. Win stars and keep your streak!' : ''}`);
    return () => stopSpeaking();
  }, [card, last]);

  return (
    <main className="screen student-screen welcome">
      <div className="screen-head">
        <span />
        <button className="link" onClick={done}>Skip</button>
      </div>
      <div className={`welcome-card ${card.cls}`} key={i}>
        <div style={{ fontSize: 72 }} aria-hidden="true">{card.icon}</div>
        <h1 className="title" style={{ color: 'inherit' }}>{card.title}</h1>
        <p className="welcome-line">{card.line}</p>
        {last && <p className="welcome-line">5 words a day. Win ⭐ and keep your 🔥!</p>}
      </div>
      <div className="progress-dots" aria-label={`Card ${i + 1} of 3`}>
        {WELCOME_CARDS.map((_, k) => <span key={k} className={`pd ${k <= i ? 'on' : ''}`} />)}
      </div>
      <button className="btn btn-primary btn-block btn-tall" onClick={() => (last ? done() : setI(i + 1))}>
        {last ? "Let's play ▶" : 'Next ▶'}
      </button>
    </main>
  );
}
