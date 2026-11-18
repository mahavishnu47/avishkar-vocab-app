import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SentenceReq, SentenceRes, SpellingHint, TodaySessionRes, Word } from '@shabd/core';
import { api, ApiRequestError } from '../shared/api.ts';
import { enqueue, flush, pendingCount } from '../shared/outbox.ts';
import { KeyboardDisplay, OnScreenKeyboard } from '../shared/OnScreenKeyboard.tsx';
import { loadSession, loadToday, pruneSessions, saveSession, saveToday } from '../shared/session-store.ts';
import { currentVoiceName, speak, speechSupported, stopSpeaking } from '../shared/speech.ts';
import { handleAuthError, lsGet, lsSet, LS, storedStudent, TopBar, useRequireToken } from './common.tsx';
import {
  emptyRec, freshState, freshWord, highlightParts, praise, seededShuffle, starterFor, uuid, wordIdxFromProgress,
} from './play-logic.ts';
import type { PlayState, Stage, SubRec } from './play-logic.ts';
import { localClassify, localEvaluate, localPositions, localSentenceMarks, localWordScore } from './safe-core.ts';

type Upd = (fn: (s: PlayState) => PlayState) => void;

const GATE_MSG = (word: string): Record<string, string> => ({
  word_missing: `Use the word ${word} in your sentence 🙂`,
  devanagari: 'Please write in English letters 🙂',
  blocked: "Let's write a kind sentence 🙂",
  empty: 'Write your sentence first 🙂',
});

function Caterpillar({ wordIdx, stage }: { wordIdx: number; stage: Stage }) {
  const si = stage === 'spell' ? 0 : stage === 'write' ? 2 : stage === 'summary' ? 3 : 1;
  return (
    <div className="cat" role="img" aria-label={`Word ${Math.min(wordIdx + 1, 5)} of 5`}>
      {[0, 1, 2, 3, 4].map((w) => (
        <span key={w} className={`cat-seg ${w === wordIdx ? 'cur' : ''}`}>
          {[0, 1, 2].map((d) => (
            <span key={d} className={`cat-dot ${w < wordIdx || (w === wordIdx && d < si) ? 'done' : w === wordIdx && d === si ? 'now' : ''}`} />
          ))}
        </span>
      ))}
    </div>
  );
}

export function Play() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [today, setToday] = useState<TodaySessionRes | null>(null);
  const [st, setSt] = useState<PlayState | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    (async () => {
      const student = storedStudent();
      let res: TodaySessionRes | null = null;
      try {
        res = await api.startToday();
        if (student) saveToday(student.id, res);
      } catch (e) {
        if (handleAuthError(e, nav)) return;
        if (student) res = loadToday<TodaySessionRes>(student.id);
        if (!res) { if (live) setError('No internet. Try again 🙂'); return; }
      }
      if (!live) return;
      if (res.session.completedAt) { nav(`/summary?s=${res.session.id}`, { replace: true }); return; }
      pruneSessions([res.session.id]);
      const fi = wordIdxFromProgress(res.words, res.progress.completedWordIds);
      let state = loadSession<PlayState>(res.session.id);
      if (!state || state.v !== 1 || fi > state.wordIdx) {
        const old = state;
        state = freshState(res.session.id, fi);
        if (old) { state.recs = old.recs; state.localScores = old.localScores; }
      }
      saveSession(state.sessionId, state);
      setToday(res); setSt(state);
    })();
    return () => { live = false; };
  }, [authed, nav, tick]);

  const update: Upd = useCallback((fn) => {
    setSt((prev) => {
      if (!prev) return prev;
      const n = fn(prev);
      saveSession(n.sessionId, n);
      return n;
    });
  }, []);

  useEffect(() => { if (st?.stage === 'summary') nav('/summary?s=' + st.sessionId, { replace: true }); }, [st?.stage, st?.sessionId, nav]);

  if (error) {
    return <main className="screen center student-screen"><div className="mitra-bird">🦜</div><p>{error}</p>
      <button className="btn btn-primary" onClick={() => { setError(''); setTick((t) => t + 1); }}>Try again</button>
      <button className="link" onClick={() => nav('/')}>Home</button></main>;
  }
  if (!today || !st || st.stage === 'summary') {
    return <main className="screen center student-screen"><div className="mitra-bird spin">🦜</div></main>;
  }
  const word = today.words[st.wordIdx];
  const common = { st, update, word, sessionId: st.sessionId, nav };
  return (
    <>
      <main className={`screen student-screen ${st.stage === 'spell' || st.stage === 'write' ? 'with-keyboard' : ''}`}>
        <TopBar left={<button className="btn btn-icon small" aria-label="home" onClick={() => nav('/')}>🏠</button>} />
        <Caterpillar wordIdx={st.wordIdx} stage={st.stage} />
        {st.stage === 'spell' && <SpellStage key={word.id} {...common} />}
        {st.stage === 'learn' && <LearnStage key={word.id} {...common} />}
        {st.stage === 'check' && <CheckStage key={word.id} {...common} />}
        {st.stage === 'write' && <WriteStage key={word.id} {...common} words={today.words} />}
      </main>
    </>
  );
}

interface StageProps { st: PlayState; update: Upd; word: Word; sessionId: number; nav: ReturnType<typeof useNavigate> }

// ------------------------------------------------------------------ Stage 1
function SpellStage({ st, update, word, sessionId }: StageProps) {
  const sp = st.spell;
  const [wob, setWob] = useState(0);
  const [slow, setSlow] = useState(false);
  const speechOk = speechSupported();
  const played = useRef(false);

  const hear = useCallback((rate: number) => {
    update((s) => ({ ...s, spell: { ...s.spell, audioPlays: s.spell.audioPlays + 1 } }));
    void speak(word.word, { rate });
  }, [update, word.word]);

  useEffect(() => { // auto-play once on entering the stage
    if (played.current || sp.done || sp.wrong > 0) return;
    played.current = true;
    if (speechOk) { void speak(word.word, { rate: 0.9 }); }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // celebrate, then move on
  useEffect(() => {
    if (!sp.done) return;
    const t = setTimeout(() => update((s) => ({ ...s, stage: 'learn' })), 1300);
    return () => clearTimeout(t);
  }, [sp.done, update]);

  const tiles = useMemo(
    () => (sp.hints.includes('letter_tiles') ? seededShuffle(word.word.split(''), `${sessionId}${word.id}`) : undefined),
    [sp.hints, word.word, word.id, sessionId],
  );
  const setInput = (input: string) => update((s) => ({ ...s, spell: { ...s.spell, input } }));
  const useHint = (h: SpellingHint) => update((s) => {
    if (s.spell.hints.includes(h)) return s;
    const hints = [...s.spell.hints, h];
    const input = h === 'first_letter' && !s.spell.input ? word.word[0] : s.spell.input;
    return { ...s, spell: { ...s.spell, hints, input } };
  });

  const check = () => {
    const input = sp.input.trim().toLowerCase();
    if (!input || sp.done) return;
    if (sp.copy) {
      if (input === word.word) update((s) => ({ ...s, stage: 'learn' })); else setWob((n) => n + 1);
      return;
    }
    const attemptNo = (sp.wrong + 1) as 1 | 2 | 3;
    enqueue({
      kind: 'attempts', sessionId,
      body: { spell: [{ clientId: uuid(), wordId: word.id, attemptNo, input, hints: sp.hints, audioPlays: sp.audioPlays, msElapsed: Date.now() - sp.t0, clientTs: new Date().toISOString() }] },
    });
    const ok = localClassify(word.word, input).isCorrect;
    update((s) => {
      const rec = { ...(s.recs[word.id] ?? emptyRec()), hints: s.spell.hints };
      if (ok) {
        rec.correctOn = attemptNo;
        return { ...s, recs: { ...s.recs, [word.id]: rec }, spell: { ...s.spell, done: true, last: input } };
      }
      const wrong = s.spell.wrong + 1;
      if (wrong >= 3) {
        rec.correctOn = null;
        return { ...s, recs: { ...s.recs, [word.id]: rec }, spell: { ...s.spell, wrong, copy: true, input: '', last: input, t0: Date.now() } };
      }
      return { ...s, recs: { ...s.recs, [word.id]: rec }, spell: { ...s.spell, wrong, last: input, t0: Date.now() } };
    });
    if (!ok) setWob((n) => n + 1);
  };

  const mask = sp.wrong >= 2 && sp.input === sp.last ? localPositions(word.word, sp.last) : undefined;
  const msg = sp.done ? praise(word.word.length)
    : sp.copy ? 'Type it once ✍️'
    : sp.wrong === 1 ? 'Almost! Listen again 🔊'
    : sp.wrong === 2 ? 'Almost! Green letters are right 💪'
    : '';

  return (
    <>
      <div className="stage-banner stage-spell">🔵 Listen & Spell</div>
      {speechOk ? (
        <div className="speak-row">
          <button className="btn btn-listen" aria-label="Hear the word" onClick={() => hear(0.9)}>🔊 Hear</button>
          <button className="btn btn-listen" aria-label="Hear the word slowly" onClick={() => { setSlow(true); hear(0.6); }}>🐢 Slowly</button>
        </div>
      ) : (
        <div className="stack">
          <div className="masked" aria-label={`${word.word.length} letters`}>{word.syllables.map((s) => '_'.repeat(s.length)).join(' ')}</div>
          <p className="feedback-almost">🔇 Sound is off on this phone. Ask someone to read the word.</p>
        </div>
      )}
      {sp.copy && <div className="word-display center answer-reveal pop">{word.word}</div>}
      <div key={wob} className={wob && !sp.done ? 'wobble' : sp.done ? 'pop' : ''}>
        <KeyboardDisplay mode="spelling" value={sp.input} slots={sp.wrong >= 1 || sp.copy ? word.word.length : undefined} correctMask={mask}
          placeholder="Type the word" showCaret={!sp.done} />
      </div>
      <div className={msg ? (sp.done ? 'feedback-ok pop' : 'feedback-almost') : ''} role="status" style={{ minHeight: msg ? undefined : 0, marginTop: sp.wrong >= 2 && !sp.done ? 18 : 0 }}>{msg}</div>
      {!sp.copy && !sp.done && (
        <div className="hint-row">
          <button className="btn" disabled={sp.hints.includes('first_letter')} onClick={() => useHint('first_letter')}>💡 First letter −6</button>
          <button className="btn" disabled={sp.hints.includes('letter_tiles')} onClick={() => useHint('letter_tiles')}>🧩 Letter tiles −14</button>
        </div>
      )}
      <span className="hidden-sr" data-voice={currentVoiceName() ?? ''} data-slow={slow ? '1' : '0'} />
      <OnScreenKeyboard mode="spelling" value={sp.input} onChange={setInput} onSubmit={check} submitDisabled={!sp.input} disabled={sp.done}
        maxLength={word.word.length + 4} restrictToLetters={sp.copy ? undefined : tiles} />
    </>
  );
}

// ------------------------------------------------------------------ Stage 2a
function LearnStage({ st, update, word }: StageProps) {
  void st;
  const [mr, setMr] = useState(lsGet(LS.showMarathi) === '1');
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 3000); return () => { clearTimeout(t); stopSpeaking(); }; }, []);
  const read = async () => {
    await speak(word.word, { rate: 0.9 });
    await speak(word.meaning, { rate: 0.9, interrupt: false });
    await speak(word.exampleSentence, { rate: 0.9, interrupt: false });
  };
  return (
    <>
      <div className="stage-banner stage-learn">🟢 Learn</div>
      <div className="card stack center" style={{ textAlign: 'center' }}>
        <div className="word-display">{word.word}</div>
        <div><span className="chip pos">{word.partOfSpeech}</span></div>
        <div className="syl">{word.syllables.join(' · ')}</div>
        <div style={{ fontSize: 20 }}>{word.meaning}</div>
        {mr && <div lang="mr" style={{ fontSize: 20, color: 'var(--c-learn)' }}>{word.meaningMarathi}</div>}
        <div className="example muted" style={{ fontSize: 19 }}>
          {highlightParts(word.exampleSentence, word).map(([t, hl], i) => (hl ? <mark key={i}>{t}</mark> : <span key={i}>{t}</span>))}
        </div>
      </div>
      <div className="speak-row">
        <button className="btn btn-learn" aria-label="Read aloud" onClick={() => void read()}>🔊 Listen</button>
        <button className="btn" aria-pressed={mr} onClick={() => { const n = !mr; setMr(n); lsSet(LS.showMarathi, n ? '1' : '0'); }}>
          <span lang="mr">मराठी</span></button>
      </div>
      <button className="btn btn-learn btn-block" disabled={!ready} onClick={() => update((s) => ({ ...s, stage: 'check' }))}>Next ▶</button>
    </>
  );
}

// ------------------------------------------------------------------ Stage 2b
function CheckStage({ st, update, word, sessionId }: StageProps) {
  const m = st.meaning;
  const options = useMemo(
    () => seededShuffle([word.meaning, ...word.distractorMeanings], `${sessionId}${word.id}`),
    [word, sessionId],
  );
  const tap = (opt: string) => {
    if (m.done || m.wrongTaps.includes(opt)) return;
    const isCorrect = opt === word.meaning;
    const attemptNo = (m.wrongTaps.length + 1) as 1 | 2;
    enqueue({
      kind: 'attempts', sessionId,
      body: { meaning: [{ clientId: uuid(), wordId: word.id, attemptNo, chosen: opt, isCorrect, msElapsed: 0, clientTs: new Date().toISOString() }] },
    });
    update((s) => {
      const rec = { ...(s.recs[word.id] ?? emptyRec()) };
      if (isCorrect) { rec.meaningOn = attemptNo; return { ...s, recs: { ...s.recs, [word.id]: rec }, meaning: { wrongTaps: s.meaning.wrongTaps, done: true } }; }
      const wrongTaps = [...s.meaning.wrongTaps, opt];
      const done = wrongTaps.length >= 2;
      if (done) rec.meaningOn = null;
      return { ...s, recs: { ...s.recs, [word.id]: rec }, meaning: { wrongTaps, done } };
    });
  };
  const gaveUp = m.done && m.wrongTaps.length >= 2;
  const solved = m.done && !gaveUp;
  return (
    <>
      <div className="stage-banner stage-learn">🟢 What does <b>{word.word}</b> mean?</div>
      <div className="stack">
        {options.map((o) => {
          const wrong = m.wrongTaps.includes(o);
          const right = o === word.meaning && m.done;
          return (
            <button key={o} className={`btn option ${wrong ? 'grey wobble' : ''} ${right ? 'right pop' : ''}`} disabled={wrong || (m.done && !right)}
              aria-pressed={right} onClick={() => tap(o)}>{o}</button>
          );
        })}
      </div>
      <div role="status" className={solved ? 'feedback-ok' : m.wrongTaps.length ? 'feedback-almost' : ''}>
        {solved ? praise(word.id.length + 1) : gaveUp ? `It means: ${word.meaning}` : m.wrongTaps.length ? 'Try again 💪' : ''}
      </div>
      {m.done && <button className="btn btn-learn btn-block" onClick={() => update((s) => ({ ...s, stage: 'write', sentence: { ...s.sentence, t0: Date.now() } }))}>Next ▶</button>}
    </>
  );
}

// ------------------------------------------------------------------ Stage 3
function WriteStage({ st, update, word, sessionId, words }: StageProps & { words: Word[] }) {
  const se = st.sentence;
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const shown = se.shown;
  const resultView = !!shown && shown.counted && !shown.pending;
  const subs = se.counted;

  const setText = (text: string) => update((s) => ({ ...s, sentence: { ...s.sentence, text } }));
  const starter = () => update((s) => s.sentence.text ? s : ({ ...s, sentence: { ...s.sentence, starter: true, text: starterFor(word.partOfSpeech, word.word) + ' ' } }));

  const submit = async () => {
    const text = se.text.trim();
    if (!text || busy) return;
    setBusy(true);
    const local = localEvaluate(text, word);
    update((s) => ({ ...s, sentence: { ...s.sentence, shown: { evaluation: local, counted: false, finalMarks: null, pending: true } } }));
    const submissionNo = (subs + 1) as 1 | 2;
    const body: SentenceReq = {
      clientId: uuid(), wordId: word.id, submissionNo, text, starterHintUsed: se.starter,
      msElapsed: Date.now() - se.t0, clientTs: new Date().toISOString(), clientEvaluation: local,
    };
    let res: SentenceRes;
    let fromServer = true;
    try {
      if (pendingCount()) await flush();
      res = await Promise.race([
        api.postSentence(sessionId, body),
        new Promise<never>((_, rej) => setTimeout(() => rej(new ApiRequestError(0, 'network', 'timeout')), 7000)),
      ]);
    } catch (e) {
      if (handleAuthError(e, nav)) return;
      fromServer = false;
      const counted = local.gate === 'ok';
      if (counted && (!(e instanceof ApiRequestError) || e.isNetwork || e.status >= 500)) enqueue({ kind: 'sentence', sessionId, body });
      res = {
        evaluation: local, counted,
        finalMarks: counted ? localSentenceMarks({ submissionNo, rubric: local.rubric, starterHintUsed: se.starter }) : null,
      };
    }
    void fromServer;
    const final: SubRec = { evaluation: res.evaluation, counted: res.counted, finalMarks: res.finalMarks };
    update((s) => {
      const rec = { ...(s.recs[word.id] ?? emptyRec()) };
      if (res.counted) rec.subs = [...rec.subs, { submissionNo, rubric: res.evaluation.rubric, starterHintUsed: s.sentence.starter }];
      return {
        ...s, recs: { ...s.recs, [word.id]: rec },
        sentence: { ...s.sentence, counted: s.sentence.counted + (res.counted ? 1 : 0), shown: final },
      };
    });
    setBusy(false);
  };

  const again = () => update((s) => ({ ...s, sentence: { ...s.sentence, text: '', shown: null, t0: Date.now() } }));

  const next = () => {
    enqueue({ kind: 'completeWord', sessionId, wordId: word.id });
    update((s) => {
      const rec = s.recs[word.id] ?? emptyRec();
      const score = localWordScore(word.id, rec);
      const localScores = score ? [...s.localScores.filter((x) => x.wordId !== word.id), score] : s.localScores;
      const idx = s.wordIdx + 1;
      if (idx >= words.length) return { ...s, localScores, wordIdx: idx, stage: 'summary' };
      return { ...s, localScores, wordIdx: idx, stage: 'spell', ...freshWord() };
    });
  };

  const ev = shown?.evaluation;
  const gateMsg = ev && ev.gate !== 'ok' && !shown?.pending ? GATE_MSG(word.word)[ev.gate] : '';
  return (
    <>
      <div className="stage-banner stage-write">🟣 Write</div>
      <div className="word-chip">
        <span>{word.word}</span>
        <button className="btn btn-icon small" aria-label="Hear the word" onClick={() => void speak(word.word)}>🔊</button>
      </div>
      <p className="center" style={{ textAlign: 'center', margin: 0 }}>Write a sentence with <b>{word.word}</b></p>
      {resultView && ev ? (
        <>
          <div className="card" style={{ fontSize: 20 }}>{se.text}</div>
          <ul className="checklist" aria-label="feedback">
            {ev.feedback.map((f) => <li key={f.key}>{f.ok ? '✅' : '⚠️'} {f.message}</li>)}
          </ul>
          {ev.tip && <div className="tip">💡 {ev.tip}</div>}
          {subs < 2 && <button className="btn btn-write btn-block" onClick={again}>Try again (better score)</button>}
          <button className="btn btn-primary btn-block" onClick={next}>{st.wordIdx >= words.length - 1 ? 'Finish ▶' : 'Next word ▶'}</button>
        </>
      ) : (
        <>
          <KeyboardDisplay mode="sentence" value={se.text} placeholder="Type here…" />
          {gateMsg && <div className="feedback-almost wobble" role="alert">{gateMsg}</div>}
          {busy && ev && (
            <ul className="checklist" aria-label="checking">
              {ev.feedback.map((f) => <li key={f.key}>{f.ok ? '✅' : '⚠️'} {f.message}</li>)}
              <li><span className="spin">⏳</span> Checking…</li>
            </ul>
          )}
          {!se.starter && !se.text && <button className="btn" onClick={starter}>💬 Help me start −5</button>}
          <OnScreenKeyboard mode="sentence" value={se.text} onChange={setText} onSubmit={() => void submit()} submitLabel="Check ✔"
            submitDisabled={!se.text.trim()} disabled={busy} />
        </>
      )}
    </>
  );
}
