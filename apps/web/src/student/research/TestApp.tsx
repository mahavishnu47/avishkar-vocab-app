/**
 * F4 student test (route /test/*): code entry, section intros, one question per screen with a timer bar,
 * autosave with retry + localStorage backup, review, submit. No marks, XP or feedback are ever shown.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResponseWrite, StartAssessmentRes, TestItem } from '@shabd/core';
import { ApiRequestError } from '../../shared/api.ts';
import { assessmentApi } from '../../shared/research/assessment-api.ts';
import { KeyboardDisplay, OnScreenKeyboard } from '../../shared/OnScreenKeyboard.tsx';
import { speak, speechSupported } from '../../shared/speech.ts';
import { handleAuthError, lsGet, lsSet, useRequireToken } from '../common.tsx';
import './test.css';

type Phase = 'loading' | 'none' | 'code' | 'intro' | 'item' | 'review' | 'done' | 'error';
interface Metric { ms: number; keys: number; dels: number }

const SECTION_INFO = {
  A: { title: 'Part A: What does it mean?', text: 'Read the word. Tap the meaning that fits best.' },
  B: { title: 'Part B: What kind of word?', text: 'Look at the underlined word. Is it a noun, a verb, an adjective or an adverb?' },
  C: { title: 'Part C: Write your own sentence', text: 'Use the word in a sentence of your own. Use a capital letter and a full stop.' },
} as const;
const POS_LABEL: Record<string, string> = { noun: 'Noun (a name)', verb: 'Verb (an action)', adjective: 'Adjective (describes)', adverb: 'Adverb (how, when, where)' };

const backupKey = (windowId: number) => `shabd.test.${windowId}`;
const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function readQuestion(it: TestItem): string {
  if (it.section === 'A') return `What does ${it.word} mean?`;
  if (it.section === 'B') return `${it.sentence} What kind of word is ${it.target}?`;
  return `Write your own sentence using the word ${it.word}.`;
}

function Underlined({ sentence, target }: { sentence: string; target: string }) {
  const i = sentence.indexOf(target);
  if (i < 0) return <>{sentence}</>;
  return <>{sentence.slice(0, i)}<u className="test-target">{target}</u>{sentence.slice(i + target.length)}</>;
}

export default function TestApp() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<StartAssessmentRes | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(new Map<string, ResponseWrite>());
  const metrics = useRef(new Map<string, Metric>());
  const shownAt = useRef(Date.now());
  const offset = useRef(0); // serverNow - clientNow
  const finishing = useRef(false);
  const seenIntro = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items = session?.items ?? [];
  const item = items[idx];

  // ---------------------------------------------------------------- loading
  const begin = useCallback((s: StartAssessmentRes) => {
    offset.current = Date.parse(s.serverNow) - Date.now();
    setSession(s);
    setWindowId(s.windowId);
    const local = (() => { try { return JSON.parse(lsGet(backupKey(s.windowId)) ?? '{}') as Record<string, string>; } catch { return {}; } })();
    const server: Record<string, string> = Object.fromEntries(s.saved.map((a) => [a.itemId, a.answer]));
    const merged = { ...server, ...local };
    for (const [id, a] of Object.entries(local)) if (server[id] !== a) pending.current.set(id, { itemId: id, answer: a });
    setAnswers(merged);
    const first = Math.max(0, s.items.findIndex((i) => merged[i.id] === undefined || merged[i.id] === ''));
    setIdx(first);
    const sec = s.items[first]?.section;
    if (first === 0 && sec) { seenIntro.current.add(sec); setPhase('intro'); } else { if (sec) seenIntro.current.add(sec); setPhase('item'); }
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    (async () => {
      try {
        const cur = await assessmentApi.current();
        if (!live) return;
        const a = cur.assessment;
        if (!a) { setPhase('none'); return; }
        setWindowId(a.windowId);
        if (a.attempt === 'submitted') { setPhase('done'); return; }
        if (a.attempt === 'in_progress') { begin(await assessmentApi.start(a.windowId)); return; }
        setPhase('code');
      } catch (e) {
        if (!live || handleAuthError(e, nav)) return;
        setMsg('We could not reach the test. Check the internet and try again.');
        setPhase('error');
      }
    })();
    return () => { live = false; };
  }, [authed, begin, nav]);

  // ---------------------------------------------------------------- autosave
  const flush = useCallback(async (): Promise<boolean> => {
    if (windowId === null || pending.current.size === 0) return true;
    const batch = [...pending.current.values()];
    setSaving(true);
    try {
      await assessmentApi.save(windowId, batch);
      for (const b of batch) if (pending.current.get(b.itemId) === b) pending.current.delete(b.itemId);
      return true;
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) { pending.current.clear(); return true; } // time is up or already submitted
      return false; // offline or server hiccup: stays pending, retried below
    } finally { setSaving(false); }
  }, [windowId]);

  const queueSave = useCallback((it: TestItem, answer: string) => {
    const m = metrics.current.get(it.id) ?? { ms: 0, keys: 0, dels: 0 };
    pending.current.set(it.id, { itemId: it.id, answer, msElapsed: Math.round(m.ms), keystrokes: m.keys, deletions: m.dels });
    if (windowId !== null) lsSet(backupKey(windowId), JSON.stringify({ ...answers, [it.id]: answer }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 500);
  }, [answers, flush, windowId]);

  useEffect(() => {
    const t = setInterval(() => { if (pending.current.size > 0 && phase !== 'done') void flush(); }, 5000);
    return () => clearInterval(t);
  }, [flush, phase]);

  const trackTime = useCallback(() => {
    if (!item) return;
    const m = metrics.current.get(item.id) ?? { ms: 0, keys: 0, dels: 0 };
    m.ms += Date.now() - shownAt.current;
    metrics.current.set(item.id, m);
    shownAt.current = Date.now();
  }, [item]);

  // ---------------------------------------------------------------- finishing
  const finish = useCallback(async () => {
    if (finishing.current || windowId === null) return;
    finishing.current = true;
    trackTime();
    setMsg('');
    try {
      for (let i = 0; i < 3 && !(await flush()); i++) await new Promise((r) => setTimeout(r, 800));
      await assessmentApi.submit(windowId);
      lsSet(backupKey(windowId), null);
      setPhase('done');
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) { setPhase('done'); return; }
      if (handleAuthError(e, nav)) return;
      setMsg('We could not send your test. Check the internet, then tap Finish again. Your answers are saved here.');
      finishing.current = false;
    }
  }, [flush, nav, trackTime, windowId]);

  // ---------------------------------------------------------------- timer
  const deadline = session ? Date.parse(session.deadlineAt) : null;
  const total = session ? Date.parse(session.deadlineAt) - Date.parse(session.startedAt) : 1;
  useEffect(() => {
    if (deadline === null || phase === 'done' || phase === 'loading' || phase === 'code') return;
    const tick = () => {
      const left = deadline - (Date.now() + offset.current);
      setRemaining(left);
      if (left <= 0) void finish();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline, phase, finish]);

  // ---------------------------------------------------------------- actions
  const startWithCode = async () => {
    if (windowId === null) return;
    setMsg('');
    try {
      begin(await assessmentApi.start(windowId, code));
    } catch (e) {
      if (handleAuthError(e, nav)) return;
      setMsg(e instanceof ApiRequestError && e.status === 403 ? 'That code is not right. Ask your teacher.'
        : e instanceof ApiRequestError && e.status === 409 ? 'The test is not open yet. Ask your teacher.' : 'We could not start. Check the internet and try again.');
    }
  };

  const setAnswer = (it: TestItem, value: string) => {
    setAnswers((a) => ({ ...a, [it.id]: value }));
    queueSave(it, value);
  };
  const typeC = (it: TestItem, value: string) => {
    const prev = answers[it.id] ?? '';
    const m = metrics.current.get(it.id) ?? { ms: 0, keys: 0, dels: 0 };
    if (value.length > prev.length) m.keys += value.length - prev.length; else m.dels += prev.length - value.length;
    metrics.current.set(it.id, m);
    setAnswer(it, value);
  };

  const go = (i: number) => {
    trackTime();
    if (timer.current) { clearTimeout(timer.current); void flush(); }
    if (i >= items.length) { setPhase('review'); return; }
    setIdx(i);
    const sec = items[i]!.section;
    if (!seenIntro.current.has(sec)) { seenIntro.current.add(sec); setPhase('intro'); } else setPhase('item');
    shownAt.current = Date.now();
  };

  const answered = useMemo(() => items.filter((i) => (answers[i.id] ?? '') !== '').length, [items, answers]);

  // ---------------------------------------------------------------- render
  const bar = remaining === null ? 100 : Math.max(0, Math.min(100, (remaining / total) * 100));
  const header = phase === 'item' || phase === 'intro' || phase === 'review' ? (
    <div className="test-head">
      <div className="levelbar test-timer" role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar)}>
        <div style={{ width: `${bar}%`, background: bar < 15 ? 'var(--c-warn)' : undefined }} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted" aria-live="off">{remaining === null ? '' : `${fmt(remaining)} left`}</span>
        <span className="muted">{saving ? 'Saving…' : answered === items.length ? 'All answered' : `${answered}/${items.length} answered`}</span>
      </div>
    </div>
  ) : null;

  if (phase === 'loading') return <main className="screen center student-screen"><p>Loading…</p></main>;
  if (phase === 'none') {
    return (
      <main className="screen center student-screen">
        <h1 className="title">No test right now</h1>
        <p className="muted">Your teacher will tell you when it is time.</p>
        <button className="btn btn-primary btn-tall" onClick={() => nav('/')}>Back home</button>
      </main>
    );
  }
  if (phase === 'error') {
    return (
      <main className="screen center student-screen">
        <p role="alert">{msg}</p>
        <button className="btn btn-primary btn-tall" onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  }
  if (phase === 'done') {
    return (
      <main className="screen center student-screen">
        <div style={{ fontSize: 72 }} aria-hidden>🎉</div>
        <h1 className="title">Well done, you finished!</h1>
        <p className="muted">Please put your tablet or phone down and wait quietly.</p>
        <button className="btn btn-primary btn-tall" onClick={() => nav('/')}>Back home</button>
      </main>
    );
  }
  if (phase === 'code') {
    return (
      <main className="screen center student-screen">
        <h1 className="title">Word Test</h1>
        <p className="muted">Type the 4-letter code from the board.</p>
        <label className="sr-only" htmlFor="test-code">Test code</label>
        <input
          id="test-code" className="test-code" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 4) void startWithCode(); }}
        />
        {msg && <p role="alert" className="feedback-warn">{msg}</p>}
        <button className="btn btn-primary btn-tall btn-block" disabled={code.length !== 4} onClick={() => void startWithCode()}>Start</button>
        <button className="link" onClick={() => nav('/')}>Back</button>
      </main>
    );
  }
  if (!item) return <main className="screen center student-screen"><p>Loading…</p></main>;

  if (phase === 'intro') {
    const info = SECTION_INFO[item.section];
    return (
      <main className="screen student-screen">
        {header}
        <section className="card stack" style={{ textAlign: 'center' }}>
          <h1 className="title">{info.title}</h1>
          <p style={{ fontSize: 20 }}>{info.text}</p>
          <p className="muted">There is no score on the screen. Just do your best.</p>
        </section>
        <button className="btn btn-primary btn-tall btn-block" onClick={() => { setPhase('item'); shownAt.current = Date.now(); }}>Let's go ▶</button>
      </main>
    );
  }

  if (phase === 'review') {
    return (
      <main className="screen student-screen">
        {header}
        <h1 className="title">Check your answers</h1>
        <p className="muted">{answered === items.length ? 'You answered every question.' : `${items.length - answered} question(s) have no answer yet. Tap a number to go back.`}</p>
        <div className="test-grid" role="list">
          {items.map((it, i) => (
            <button key={it.id} role="listitem" className={`btn small test-chip ${(answers[it.id] ?? '') !== '' ? 'done' : ''}`} aria-label={`Question ${i + 1}${(answers[it.id] ?? '') !== '' ? ', answered' : ', not answered'}`}
              onClick={() => { setIdx(i); setPhase('item'); shownAt.current = Date.now(); }}>{i + 1}</button>
          ))}
        </div>
        {msg && <p role="alert" className="feedback-warn">{msg}</p>}
        <button className="btn btn-primary btn-tall btn-block" onClick={() => void finish()}>Finish test ✔</button>
      </main>
    );
  }

  // one question per screen
  const value = answers[item.id] ?? '';
  const isC = item.section === 'C';
  return (
    <main className={`screen student-screen ${isC ? 'with-keyboard' : ''}`}>
      {header}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="chip">Question {idx + 1} of {items.length}</span>
        {speechSupported() && <button className="btn btn-icon small" aria-label="Read the question to me" onClick={() => void speak(readQuestion(item))}>🔊</button>}
      </div>
      {item.section === 'A' && (
        <>
          <h1 className="title test-q">What does <b>{item.word}</b> mean?</h1>
          <div className="stack">
            {item.options.map((o) => (
              <button key={o} className={`btn btn-block btn-tall test-opt ${value === o ? 'picked' : ''}`} aria-pressed={value === o} onClick={() => setAnswer(item, o)}>{o}</button>
            ))}
          </div>
        </>
      )}
      {item.section === 'B' && (
        <>
          <h1 className="title test-q"><Underlined sentence={item.sentence} target={item.target} /></h1>
          <p className="muted">What kind of word is <b>{item.target}</b> here?</p>
          <div className="stack">
            {item.options.map((o) => (
              <button key={o} className={`btn btn-block btn-tall test-opt ${value === o ? 'picked' : ''}`} aria-pressed={value === o} onClick={() => setAnswer(item, o)}>{POS_LABEL[o] ?? o}</button>
            ))}
          </div>
        </>
      )}
      {isC && (
        <>
          <h1 className="title test-q">Write a sentence with <b>{item.word}</b></h1>
          <KeyboardDisplay value={value} mode="sentence" placeholder="Type here…" showCaret />
        </>
      )}
      {isC ? (
        <OnScreenKeyboard mode="sentence" value={value} onChange={(v) => typeC(item, v)} onSubmit={() => go(idx + 1)} submitLabel={idx + 1 >= items.length ? 'Review ▶' : 'Next ▶'} />
      ) : (
        <div className="row test-nav">
          <button className="btn btn-tall" disabled={idx === 0} onClick={() => go(idx - 1)}>◀ Back</button>
          <button className="btn btn-primary btn-tall" onClick={() => go(idx + 1)}>{idx + 1 >= items.length ? 'Review ▶' : 'Next ▶'}</button>
        </div>
      )}
      {isC && idx > 0 && <button className="link" onClick={() => go(idx - 1)}>◀ Back</button>}
    </main>
  );
}
