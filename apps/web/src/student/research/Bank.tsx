/** F6 "My Word Bank" (route /bank): every word the child has learned, with their own sentence. Cached for offline. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BankWord } from '@shabd/core';
import { speak, speechSupported } from '../../shared/speech.ts';
import { readBankCache, vocabApi, writeBankCache } from '../../shared/research/vocab-api.ts';
import { handleAuthError, TopBar, useRequireToken } from '../common.tsx';

const FILTERS = ['all', 'noun', 'verb', 'adjective', 'adverb'] as const;
type Filter = (typeof FILTERS)[number];

export function filterBank(words: BankWord[], pos: Filter, q: string): BankWord[] {
  const s = q.trim().toLowerCase();
  return words.filter((w) => (pos === 'all' || w.partOfSpeech === pos) && (!s || w.word.toLowerCase().includes(s)));
}

export default function Bank() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [words, setWords] = useState<BankWord[] | null>(() => readBankCache()?.words ?? null);
  const [offline, setOffline] = useState(false);
  const [pos, setPos] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    vocabApi.bank().then((b) => { if (live) { setWords(b.words); setOffline(false); writeBankCache(b); } },
      (e) => { if (live && !handleAuthError(e, nav)) setOffline(true); });
    return () => { live = false; };
  }, [authed, nav]);

  const shown = useMemo(() => filterBank(words ?? [], pos, q), [words, pos, q]);

  return (
    <main className="screen student-screen">
      <TopBar left={<button className="btn btn-icon small" aria-label="Back" onClick={() => nav('/')}>←</button>} right={<span className="chip">{words?.length ?? 0} words</span>} />
      <h1 className="title" style={{ fontSize: 24 }}>My Word Bank</h1>
      {offline && <p className="muted">No internet. Showing your saved list.</p>}
      {!words ? <p>{offline ? 'No internet 🙂' : 'Loading…'}</p> : (
        <>
          <input className="input" type="search" aria-label="Search words" placeholder="Search a word" value={q} onChange={(e) => setQ(e.target.value)} style={{ minHeight: 48, fontSize: 18 }} />
          <div role="group" aria-label="Word type" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FILTERS.map((f) => (
              <button key={f} className={`chip pos${pos === f ? ' saved' : ''}`} aria-pressed={pos === f} onClick={() => setPos(f)} style={{ minHeight: 44, padding: '4px 14px', fontSize: 16, fontWeight: pos === f ? 800 : 600, outline: pos === f ? '3px solid var(--c-primary, #2563eb)' : undefined }}>
                {f === 'all' ? 'All' : f[0]!.toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {words.length === 0 && <p className="muted">Finish a day of words and they will show up here.</p>}
          {words.length > 0 && shown.length === 0 && <p className="muted">No words match.</p>}
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {shown.map((w) => (
              <li key={w.wordId} className="card stack">
                <button className="btn btn-block" style={{ minHeight: 56, justifyContent: 'space-between', textAlign: 'left' }} aria-expanded={open === w.wordId}
                  onClick={() => { setOpen(open === w.wordId ? null : w.wordId); if (speechSupported()) void speak(w.word); }}>
                  <span style={{ fontSize: 22, fontWeight: 800 }}>{w.word}</span>
                  <span><span className="chip pos">{w.partOfSpeech}</span> {'⭐'.repeat(Math.max(0, Math.min(3, w.stars)))}</span>
                </button>
                <p>{w.meaning}</p>
                {open === w.wordId && (
                  <div className="stack">
                    <p className="muted">Example: {w.exampleSentence}</p>
                    <p>{w.bestSentence ? <>My sentence: <b>{w.bestSentence}</b></> : <span className="muted">You have not written a sentence for this word yet.</span>}</p>
                    {w.recallPct !== null && <p className="muted">I remembered it {w.recallPct}% of the time.</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
