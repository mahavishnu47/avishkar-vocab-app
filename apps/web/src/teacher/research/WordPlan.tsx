import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StudyPlanRes, Word } from '@shabd/core';
import { api } from '../../shared/api.ts';
import { wordPlanApi } from '../../shared/research/wordplan-api.ts';
import { Page, useLoad } from '../ui.tsx';

const POS_ORDER = ['noun', 'verb', 'adjective', 'adverb'];

/** Teacher: the 20-day plan (day, date, 5 words with part of speech), holiday toggles, swap a word, print. */
export default function WordPlan() {
  const { studyId } = useParams();
  const id = Number(studyId);
  const { data, setData, error, loading } = useLoad(() => wordPlanApi.plan(id), [id]);
  const [msg, setMsg] = useState<string | null>(null);
  const [swap, setSwap] = useState<{ dayNo: number; position: number } | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Word[]>([]);

  const run = async (p: Promise<StudyPlanRes>) => {
    try { setData(await p); setMsg(null); } catch (e) { setMsg((e as Error).message || 'Could not save'); }
  };
  const holidaySet = new Set(data?.holidays ?? []);
  const toggleHoliday = (date: string) => {
    if (!data) return;
    const next = new Set(holidaySet);
    if (next.has(date)) next.delete(date); else next.add(date);
    return run(wordPlanApi.setHolidays(id, [...next].sort()));
  };
  const search = async () => {
    if (!q.trim()) { setFound([]); return; }
    try { setFound((await api.searchWords({ q: q.trim(), limit: 8 })).items); } catch { setFound([]); }
  };
  const pick = (w: Word) => {
    if (!data || !swap) return;
    const day = data.days.find((d) => d.dayNo === swap.dayNo);
    if (!day) return;
    const ids = day.words.map((x) => x.wordId);
    ids[swap.position - 1] = w.id;
    setSwap(null); setQ(''); setFound([]);
    return run(wordPlanApi.setDay(id, swap.dayNo, ids));
  };

  return (
    <Page title="Word plan" loading={loading} error={error}>
      {data && (
        <div className="stack">
          <p className="muted"><Link to={`/teacher/study/${id}`}>Back to study</Link></p>
          <h2 className="title">Word plan: {data.schoolDays} school days</h2>
          <p className="muted">Starts {data.startDate}. Weekends are skipped. Mark a holiday and its words move to the next school day.</p>
          <p aria-label="Part of speech counts">
            {POS_ORDER.map((p) => <span key={p} className="chip" style={{ marginRight: 8 }}>{p}: {data.posCounts[p] ?? 0}</span>)}
          </p>
          {data.warnings.map((w) => <p key={w} role="alert" className="error">{w}</p>)}
          {msg && <p role="alert" className="error">{msg}</p>}
          <button className="btn" onClick={() => window.print()}>Print the list</button>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Day</th><th>Date</th><th>Words</th><th className="no-print">Holiday</th></tr></thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.dayNo}>
                  <td>{d.dayNo}</td>
                  <td>{d.date}</td>
                  <td>
                    {d.words.length === 0 && <span className="muted">No words planned</span>}
                    {d.words.map((w) => (
                      <span key={w.wordId} style={{ display: 'inline-block', marginRight: 10 }}>
                        <strong>{w.word}</strong> <span className="muted">({w.partOfSpeech.slice(0, 3)})</span>{' '}
                        <button className="link no-print" aria-label={`Swap ${w.word}`} onClick={() => { setSwap({ dayNo: d.dayNo, position: w.position }); setQ(''); setFound([]); }}>swap</button>
                      </span>
                    ))}
                    {swap?.dayNo === d.dayNo && (
                      <div className="no-print" style={{ marginTop: 6 }}>
                        <input aria-label="Search words" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} placeholder="Find a word" />
                        <button className="btn small" onClick={() => void search()}>Search</button>{' '}
                        <button className="link" onClick={() => setSwap(null)}>Cancel</button>
                        <ul>{found.map((w) => <li key={w.id}><button className="link" onClick={() => pick(w)}>{w.word} ({w.partOfSpeech})</button></li>)}</ul>
                      </div>
                    )}
                  </td>
                  <td className="no-print">
                    <label><input type="checkbox" checked={holidaySet.has(d.date)} onChange={() => void toggleHoliday(d.date)} /> Holiday</label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.holidays.length > 0 && (
            <div>
              <p className="muted">Holidays (skipped):</p>
              <ul>{data.holidays.map((h) => (
                <li key={h}>{h} <button className="link no-print" aria-label={`Remove holiday ${h}`} onClick={() => void toggleHoliday(h)}>remove</button></li>
              ))}</ul>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
