import { useRef } from 'react';
import type { Word } from '@shabd/core';
import { enqueue } from '../shared/outbox.ts';
import { highlightParts, praise, uuid } from './play-logic.ts';
import type { PlayState } from './play-logic.ts';

type Choice = 'noun' | 'verb' | 'adjective' | 'adverb';

const CHOICES: { pos: Choice; label: string; help: string }[] = [
  { pos: 'noun', label: 'Noun', help: 'naming word' },
  { pos: 'verb', label: 'Verb', help: 'doing word' },
  { pos: 'adjective', label: 'Adjective', help: 'describing word' },
  { pos: 'adverb', label: 'Adverb', help: 'how / when word' },
];

/** One short hint after the first wrong tap (it never names the answer). */
const HINT: Record<Choice, string> = {
  noun: 'It is the name of a person, place or thing.',
  verb: 'It tells what someone or something does.',
  adjective: 'It tells us more about a person, place or thing.',
  adverb: 'It tells us how, when or where something happens.',
};
const EXPLAIN: Record<Choice, string> = {
  noun: 'a naming word',
  verb: 'a doing word',
  adjective: 'a describing word',
  adverb: 'a how / when word',
};

interface Props { st: PlayState; update: (fn: (s: PlayState) => PlayState) => void; word: Word; sessionId: number }

/** Stage 2c: "What kind of word is X?" Two tries, hint after the first wrong tap, answer shown after two. */
export function PosStage({ st, update, word, sessionId }: Props) {
  const p = st.pos;
  const answer = word.partOfSpeech as Choice;
  const lastTapAt = useRef(0);
  const tap = (choice: Choice) => {
    if (p.done || p.wrongTaps.includes(choice)) return;
    const now = Date.now(); // a short pause between taps, as in the meaning check
    if (now - lastTapAt.current < 500) return;
    lastTapAt.current = now;
    const attemptNo = (p.wrongTaps.length + 1) as 1 | 2;
    enqueue({
      kind: 'attempts', sessionId,
      body: { pos: [{ clientId: uuid(), wordId: word.id, attemptNo, chosen: choice, msElapsed: Math.max(0, now - p.t0), clientTs: new Date().toISOString() }] },
    });
    update((s) => {
      if (choice === answer) return { ...s, pos: { ...s.pos, done: true } };
      const wrongTaps = [...s.pos.wrongTaps, choice];
      return { ...s, pos: { ...s.pos, wrongTaps, done: wrongTaps.length >= 2 } };
    });
  };
  const gaveUp = p.done && p.wrongTaps.length >= 2;
  const solved = p.done && !gaveUp;
  const msg = solved ? praise(word.id.length + 2)
    : gaveUp ? `${word.word} is ${answer === 'adjective' || answer === 'adverb' ? 'an' : 'a'} ${answer}: ${EXPLAIN[answer]}.`
    : p.wrongTaps.length ? `Try again 💪 ${HINT[answer]}` : '';
  return (
    <>
      <div className="stage-banner stage-learn">🟢 What kind of word is <b>{word.word}</b>?</div>
      <div className="example muted pos-example" style={{ fontSize: 19 }}>
        {highlightParts(word.exampleSentence, word).map(([t, hl], i) => (hl ? <mark key={i}>{t}</mark> : <span key={i}>{t}</span>))}
      </div>
      <div className="stack">
        {CHOICES.map((c) => {
          const wrong = p.wrongTaps.includes(c.pos);
          const right = p.done && c.pos === answer;
          return (
            <button key={c.pos} className={`btn option pos-option ${wrong ? 'grey wobble' : ''} ${right ? 'right pop' : ''}`}
              disabled={wrong || (p.done && !right)} aria-pressed={right} onClick={() => tap(c.pos)}>
              <span>{c.label}</span> <span className="pos-help">({c.help})</span>
            </button>
          );
        })}
      </div>
      <div role="status" className={solved ? 'feedback-ok' : p.wrongTaps.length ? 'feedback-almost' : ''}>{msg}</div>
      {p.done && (
        <button className="btn btn-learn btn-block"
          onClick={() => update((s) => ({ ...s, stage: 'write', sentence: { ...s.sentence, t0: Date.now() } }))}>Next ▶</button>
      )}
    </>
  );
}
