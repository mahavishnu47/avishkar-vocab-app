import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { CreateWordReq, DailySet, Difficulty, PartOfSpeech, Word } from '@shabd/core';
import { api } from '../shared/api.ts';
import { DateStepper, errMsg, Page, useLoad } from './ui.tsx';
import { addDays, istToday } from './util.ts';

const POS: PartOfSpeech[] = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection'];

function WordPicker({ onPick, onCancel }: { onPick: (w: Word) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [pos, setPos] = useState('');
  const [tag, setTag] = useState('');
  const [items, setItems] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.searchWords({
        q: q.trim() || undefined, difficulty: difficulty ? (Number(difficulty) as Difficulty) : undefined,
        partOfSpeech: (pos || undefined) as PartOfSpeech | undefined, tag: tag.trim() || undefined, limit: 20,
      }).then((r) => { if (live) { setItems(r.items); setTotal(r.total); setErr(null); } }, (e) => live && setErr(errMsg(e)));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, difficulty, pos, tag]);
  return (
    <section className="card stack t-picker" aria-label="Word picker">
      <div className="t-filters">
        <input type="search" placeholder="Search word or meaning" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Any level</option><option value="1">Easy</option><option value="2">Medium</option><option value="3">Hard</option>
        </select>
        <select aria-label="Part of speech" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">Any type</option>{POS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input placeholder="Theme tag" aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
      </div>
      {err && <div className="t-error">{err}</div>}
      <div className="muted">{total} words{total > items.length ? ` (showing ${items.length})` : ''}</div>
      <ul className="t-results">
        {items.map((w) => (
          <li key={w.id}>
            <div><b>{w.word}</b> <span className="muted">{w.partOfSpeech} · level {w.difficulty}</span><div className="muted">{w.meaning}</div></div>
            <button className="btn" onClick={() => onPick(w)}>Use this</button>
          </li>
        ))}
      </ul>
      <button className="btn" onClick={onCancel}>Close</button>
    </section>
  );
}

const emptyForm = { word: '', partOfSpeech: 'noun' as PartOfSpeech, difficulty: '2', meaning: '', meaningMarathi: '', exampleSentence: '', d1: '', d2: '', syllables: '', tags: '', contextWords: '' };

function CustomWordForm({ onCreated, onCancel }: { onCreated: (w: Word) => void; onCancel: () => void }) {
  const [f, setF] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof emptyForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const word = f.word.trim().toLowerCase();
    if (!/^[a-z]{3,14}$/.test(word)) { setErr('Word must be 3-14 letters, a-z only'); return; }
    const syl = f.syllables.trim() ? f.syllables.split(/[-·,\s]+/).filter(Boolean).map((s) => s.toLowerCase()) : [word];
    if (syl.join('') !== word) { setErr('Syllables must join to make the word (e.g. el-e-phant)'); return; }
    const body: CreateWordReq = {
      word, partOfSpeech: f.partOfSpeech, difficulty: Number(f.difficulty) as Difficulty,
      meaning: f.meaning.trim(), meaningMarathi: f.meaningMarathi.trim(), exampleSentence: f.exampleSentence.trim(),
      distractorMeanings: [f.d1.trim(), f.d2.trim()], syllables: syl, tags: list(f.tags), contextWords: list(f.contextWords),
    };
    try { onCreated(await api.createWord(body)); } catch (er) { setErr(errMsg(er)); }
  };
  return (
    <form className="card stack" onSubmit={submit} aria-label="Custom word">
      <h3 className="t-h2">Custom word</h3>
      <label className="t-field">Word<input value={f.word} onChange={set('word')} required /></label>
      <div className="t-two">
        <label className="t-field">Type<select value={f.partOfSpeech} onChange={set('partOfSpeech')}>{POS.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="t-field">Level<select value={f.difficulty} onChange={set('difficulty')}><option value="1">Easy</option><option value="2">Medium</option><option value="3">Hard</option></select></label>
      </div>
      <label className="t-field">Meaning (simple English)<input value={f.meaning} onChange={set('meaning')} required /></label>
      <label className="t-field">Meaning in Marathi<input className="deva" value={f.meaningMarathi} onChange={set('meaningMarathi')} required /></label>
      <label className="t-field">Example sentence<input value={f.exampleSentence} onChange={set('exampleSentence')} required /></label>
      <label className="t-field">Wrong meaning 1<input value={f.d1} onChange={set('d1')} required /></label>
      <label className="t-field">Wrong meaning 2<input value={f.d2} onChange={set('d2')} required /></label>
      <label className="t-field">Syllables (el-e-phant)<input value={f.syllables} onChange={set('syllables')} /></label>
      <label className="t-field">Theme tags (comma separated)<input value={f.tags} onChange={set('tags')} required /></label>
      <label className="t-field">Words used nearby (comma separated)<input value={f.contextWords} onChange={set('contextWords')} required /></label>
      {err && <div className="t-error" role="alert">{err}</div>}
      <div className="row"><button className="btn btn-primary">Add word</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export function Words() {
  const classId = Number(useParams().classId);
  const today = istToday();
  const [date, setDate] = useState(today);
  const { data, setData, error, loading } = useLoad(() => api.dailyWords(classId, date), [classId, date]);
  const [draft, setDraft] = useState<Word[] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<Set<string>>(new Set());
  const cache = useRef(new Map<string, Set<string>>());

  useEffect(() => { setDraft(data ? data.words : null); setSlot(null); setCustom(false); }, [data]);
  useEffect(() => { setMsg(null); setErr(null); }, [date]);

  // Words used in the previous 30 days (client-side check).
  useEffect(() => {
    const key = `${classId}|${date}`;
    const hit = cache.current.get(key);
    if (hit) { setRecent(hit); return; }
    let live = true;
    const days = Array.from({ length: 30 }, (_, i) => addDays(date, -(i + 1)));
    Promise.all(days.map((d) => api.dailyWords(classId, d).then((s) => s.words.map((w) => w.id), () => [] as string[])))
      .then((all) => { const s = new Set(all.flat()); cache.current.set(key, s); if (live) setRecent(s); });
    return () => { live = false; };
  }, [classId, date]);

  const dirty = !!(draft && data && draft.some((w, i) => w.id !== data.words[i]?.id));
  const apply = (set: DailySet, text: string) => { setData(set); setMsg(text); setErr(null); };
  const pick = (w: Word) => {
    if (!draft || slot === null) return;
    if (draft.some((x, i) => i !== slot && x.id === w.id)) { setErr(`"${w.word}" is already in today's set`); return; }
    const next = draft.slice(); next[slot] = w; setDraft(next); setSlot(null); setCustom(false); setErr(null);
  };
  const save = async () => {
    if (!draft) return;
    try { apply(await api.setDailyWords(classId, date, { wordIds: draft.map((w) => w.id) }), 'Saved. Students who have not started will see these words.'); }
    catch (e) { setErr(errMsg(e)); }
  };
  const reset = async () => {
    try { apply(await api.resetDailyWords(classId, date), 'Back to automatic words.'); } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Page classId={classId} title="Today's words" loading={loading && !data} error={error}>
      <DateStepper date={date} onChange={setDate} />
      {data && draft && (
        <>
          <div className="row t-meta">
            <span className={`t-badge ${data.source === 'teacher' ? 't-badge-edited' : ''}`}>{data.source === 'teacher' ? 'Edited' : 'Auto'}</span>
            <span className="muted">Day {data.dayIndex} of the word list</span>
          </div>
          <ol className="t-slots">
            {draft.map((w, i) => (
              <li key={`${i}-${w.id}`} className="card t-slot">
                <div>
                  <b className="t-slot-word">{w.word}</b>{' '}
                  <span className="muted">{w.partOfSpeech} · {['', 'easy', 'medium', 'hard'][w.difficulty]}</span>
                  {w.id !== data.words[i]?.id && <span className="t-badge t-badge-edited">Changed</span>}
                  {w.source === 'teacher' && <span className="t-badge">Custom</span>}
                  <div className="muted">{w.meaning}</div>
                  {recent.has(w.id) && <div className="t-warn" role="note">⚠ Used in the last 30 days</div>}
                </div>
                <button className="btn" onClick={() => { setSlot(slot === i ? null : i); setCustom(false); }}>Change</button>
                {slot === i && (
                  <div className="t-slot-panel">
                    {custom
                      ? <CustomWordForm onCreated={pick} onCancel={() => setCustom(false)} />
                      : <>
                          <button className="btn" onClick={() => setCustom(true)}>+ Custom word</button>
                          <WordPicker onPick={pick} onCancel={() => setSlot(null)} />
                        </>}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {msg && <div className="feedback-ok" role="status">{msg}</div>}
          {err && <div className="t-error" role="alert">{err}</div>}
          <div className="row t-actions">
            <button className="btn btn-primary" disabled={!dirty} onClick={save}>Save day</button>
            <button className="btn" disabled={data.source !== 'teacher'} onClick={reset}>Reset to auto</button>
          </div>
        </>
      )}
    </Page>
  );
}
