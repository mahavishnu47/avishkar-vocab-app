import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkillKey, StudentProgressRes } from '@shabd/core';
import { api } from '../shared/api.ts';
import { handleAuthError, lsJson, lsSet, TopBar, useRequireToken } from './common.tsx';
import { getActiveId } from './profiles.ts';
import './progress.css';

const key = (id: number) => `shabd.progress.${id}`;
function stored(): StudentProgressRes | null {
  const id = getActiveId();
  const p = id === null ? null : lsJson<StudentProgressRes>(key(id));
  return p && typeof p === 'object' && p.totals && Array.isArray(p.days) && Array.isArray(p.skills) ? p : null;
}
function save(p: StudentProgressRes): void {
  const id = getActiveId();
  if (id !== null) lsSet(key(id), JSON.stringify(p));
}

const SKILL_UI: Record<SkillKey, { emoji: string; name: string }> = {
  spelling: { emoji: '✏️', name: 'Spelling' },
  meaning: { emoji: '💡', name: 'Meaning' },
  wordType: { emoji: '🏷️', name: 'Word type' },
  sentence: { emoji: '📝', name: 'Sentences' },
};
const LABEL_EMOJI = { Super: '🌟', Good: '👍', 'Keep practising': '💪' } as const;
const DAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const dayLetters = (iso: string) => DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
/** "Sat 21 Nov" - children read this faster than 2026-11-21. */
const niceDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

export function Progress() {
  const nav = useNavigate();
  const authed = useRequireToken(nav);
  const [data, setData] = useState<StudentProgressRes | null>(stored);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    api.studentProgress().then((p) => { if (live) { setData(p); setOffline(false); save(p); } })
      .catch((e) => { if (!handleAuthError(e, nav) && live) setOffline(true); });
    return () => { live = false; };
  }, [authed, nav]);

  const back = <button className="btn btn-icon small" aria-label="Back" onClick={() => nav('/')}>←</button>;

  if (!data) {
    return (
      <main className="screen center student-screen">
        <TopBar left={back} />
        <div className="mitra-bird">🦜</div>
        <p>{offline ? 'No internet 🙂' : 'Loading…'}</p>
        {offline && <button className="btn" onClick={() => location.reload()}>Try again</button>}
      </main>
    );
  }

  const t = data.totals;
  const empty = t.daysPlayed === 0 && data.days.every((d) => !d.played);
  const played14 = data.days.filter((d) => d.played).length;
  return (
    <main className="screen student-screen">
      <TopBar left={back} right={<span className="name">My Progress 📈</span>} />
      {empty && <section className="card stack" style={{ textAlign: 'center' }}>
        <div className="big-num">🌱</div>
        <div className="title" style={{ fontSize: 22 }}>Play your first day!</div>
        <div className="muted">Your stars will grow here.</div>
      </section>}

      <section className="card stack">
        <div className="streak-card">
          <div><div className="big-num">🔥 {t.currentStreak}</div><div className="muted">{t.currentStreak === 1 ? 'day in a row' : 'days in a row'}</div></div>
          <div><div className="big-num">🏅 {t.bestStreak}</div><div className="muted">best streak</div></div>
        </div>
        <div className="title" style={{ fontSize: 22 }}>⭐ Level {t.level.level + 1}</div>
        <div className="levelbar big" role="progressbar" aria-valuenow={t.levelPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Level progress">
          <div style={{ width: `${t.levelPercent}%` }} />
        </div>
        <div className="muted">{t.xpToNextLevel} more ⭐ to Level {t.level.level + 2}</div>
      </section>

      <section className="card stack">
        <div className="streak-card">
          <div><div className="big-num" data-testid="words-learned">📚 {t.wordsLearned}</div><div className="muted">My words learned</div></div>
          <div><div className="big-num">📅 {t.daysPlayed}</div><div className="muted">{t.daysPlayed === 1 ? 'day played' : 'days played'}</div></div>
        </div>
      </section>

      <section className="card stack" aria-label="Last 14 days">
        <div className="title" style={{ fontSize: 22 }}>Last 14 days</div>
        <p className="sr-only">{`You played on ${played14} of the last 14 days.`}</p>
        <ol className="days14">
          {data.days.map((d) => (
            <li key={d.date} className={`day ${d.played ? 'on' : ''}`} aria-label={d.played ? `${d.date}: ${d.wordsDone} words, ${d.stars ?? 0} stars` : `${d.date}: rest`}>
              <span className="bar"><span style={{ height: `${(d.wordsDone / 5) * 100}%` }} /></span>
              <span className="dot" aria-hidden="true">{d.played ? '⭐' : '·'}</span>
              <span className="dl" aria-hidden="true">{dayLetters(d.date)}</span>
            </li>
          ))}
        </ol>
      </section>

      {data.skills.length > 0 && (
        <section className="card stack" aria-label="My skills">
          <div className="title" style={{ fontSize: 22 }}>My skills</div>
          {data.skills.map((s) => (
            <div key={s.key} className="skill">
              <div className="skill-head"><span>{SKILL_UI[s.key].emoji} {SKILL_UI[s.key].name}</span><strong>{LABEL_EMOJI[s.label]} {s.label}</strong></div>
              <div className="levelbar big" role="progressbar" aria-valuenow={s.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${SKILL_UI[s.key].name}: ${s.label}`}>
                <div style={{ width: `${s.percent}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      {data.wordsToPractise.length > 0 && (
        <section className="card stack" aria-label="Words to practise">
          <div className="title" style={{ fontSize: 22 }}>Words to practise 💪</div>
          <ul className="chips">{data.wordsToPractise.map((w) => <li key={w.wordId} className="chip">{w.word}</li>)}</ul>
        </section>
      )}

      {data.recentSessions.length > 0 && (
        <section className="card stack" aria-label="My last days">
          <div className="title" style={{ fontSize: 22 }}>My last days</div>
          <ul className="recent">
            {data.recentSessions.map((s) => (
              <li key={s.sessionId}><span>{niceDate(s.date)}</span><span>{s.wordsDone}/5 words</span><span aria-label={`${s.stars} stars`}>⭐ {s.stars}</span></li>
            ))}
          </ul>
        </section>
      )}
      {offline && <p className="muted center" style={{ textAlign: 'center' }}>No internet. Showing saved info.</p>}
      <button className="btn btn-block" onClick={() => nav('/')}>← Back</button>
    </main>
  );
}
