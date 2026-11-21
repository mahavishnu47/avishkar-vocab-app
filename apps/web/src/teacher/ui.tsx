/** Shared teacher UI pieces: data hook, shell with nav, sortable table, bars, date stepper. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { ClassRoom, IsoDate } from '@shabd/core';
import { api, ApiRequestError, setToken } from '../shared/api.ts';
import { addDays, sortRows, type SortDir } from './util.ts';

/** Login URL that returns the teacher to the page they were on (only /teacher and /school paths are honoured). */
export function loginPath(): string {
  const here = window.location.pathname + window.location.search;
  return here === '/teacher' || here.startsWith('/teacher/login') ? '/teacher/login' : `/teacher/login?next=${encodeURIComponent(here)}`;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiRequestError) return e.isNetwork ? 'No internet. Your changes were not saved. Try again.' : e.message;
  return e instanceof Error ? e.message : 'Something went wrong';
}

/** Redirects to login on 401. */
export function useAuthRedirect() {
  const navigate = useNavigate();
  return useCallback((e: unknown): boolean => {
    if (e instanceof ApiRequestError && e.status === 401) {
      setToken('staff', null);
      navigate(loginPath(), { replace: true });
      return true;
    }
    return false;
  }, [navigate]);
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const redirect = useAuthRedirect();
  const seq = useRef(0);
  const run = useCallback(() => {
    const my = ++seq.current;
    setLoading(true);
    fn().then(
      (d) => { if (my === seq.current) { setData(d); setError(null); setLoading(false); } },
      (e) => { if (my === seq.current && !redirect(e)) { setError(errMsg(e)); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, setData, error, loading, reload: run };
}

/** Page frame: nav bar (class switcher + links) and a loading/error shell. */
export function Page({ classId, title, children, loading, error, className }: {
  classId?: number; title?: string; children?: ReactNode; loading?: boolean; error?: string | null; className?: string;
}) {
  const navigate = useNavigate();
  const { data: classes } = useLoad(() => (classId ? api.listClasses() : Promise.resolve([] as ClassRoom[])), [classId]);
  const cls = classes?.find((c) => c.id === classId);
  const base = classId ? `/teacher/classes/${classId}` : '';
  const logout = async () => { try { await api.logout('staff'); } catch { /* ignore */ } setToken('staff', null); navigate('/teacher/login'); };
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let live = true;
    api.me('staff').then((m) => { if (live) setIsAdmin(m.role === 'teacher' && m.teacher.role === 'school_admin'); }, () => { /* the guard handles auth */ });
    return () => { live = false; };
  }, []);
  // A typed/old link like /teacher/classes/abc/roster used to show "NaNNaN" in the header and a bare "Not found" (T-4).
  if (classId !== undefined && !Number.isInteger(classId)) {
    return (
      <main className="teacher screen t-page">
        <nav className="t-nav no-print" aria-label="Teacher"><Link to="/teacher" className="t-brand">🦜 Shabd Mitra</Link></nav>
        <h1 className="title t-title">We can't find that class</h1>
        <p className="muted">The link may be old or mistyped.</p>
        <Link className="btn btn-primary" to="/teacher">Go to my classes</Link>
      </main>
    );
  }
  return (
    <main className={`teacher screen t-page ${className ?? ''}`}>
      <nav className="t-nav no-print" aria-label="Teacher">
        <Link to="/teacher" className="t-brand">🦜 Shabd Mitra</Link>
        {classId && classes && classes.length > 0 && (
          <select aria-label="Class" value={classId} onChange={(e) => navigate(e.target.value === 'all' ? '/teacher?all=1' : `/teacher/classes/${e.target.value}/dashboard`)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="all">All classes…</option>
          </select>
        )}
        {classId && (
          <>
            <NavLink to={`${base}/dashboard`}>Today</NavLink>
            <NavLink to={`${base}/words`}>Words</NavLink>
            <NavLink to={`${base}/roster`}>Roster</NavLink>
            <NavLink to={`${base}/leaderboard`}>Leaderboard</NavLink>
            <NavLink to={`${base}/analytics`}>Analytics</NavLink>
            <NavLink to={`${base}/progress`}>Progress</NavLink>
            <NavLink to={`${base}/tests`}>Tests</NavLink>
            <NavLink to={`${base}/authenticity`}>Checks</NavLink>
            <NavLink to={`${base}/share`}>Share</NavLink>
            <NavLink to={`${base}/cards`}>Cards</NavLink>
          </>
        )}
        <NavLink to="/teacher/study">Study</NavLink>
        {isAdmin && <Link to="/school">School</Link>}
        <button className="btn t-logout" onClick={logout}>Log out</button>
      </nav>
      {title && <h1 className="title t-title">{title}{cls ? <span className="muted t-sub"> · {cls.name} ({cls.classCode})</span> : null}</h1>}
      {error && <div className="t-error" role="alert">{error}</div>}
      {loading && !error ? <p className="muted">Loading…</p> : children}
    </main>
  );
}

export interface Col<T> {
  key: string; label: string; get: (r: T) => string | number | null | undefined;
  render?: (r: T) => ReactNode; className?: string;
}
/** Table sortable by any column; the page itself never scrolls sideways (wrapper scrolls). */
export function SortTable<T>({ cols, rows, rowKey, onRow, initial, caption }: {
  cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string | number; onRow?: (r: T) => void;
  initial?: { key: string; dir: SortDir }; caption?: string;
}) {
  const [sort, setSort] = useState(initial ?? { key: cols[0].key, dir: 'asc' as SortDir });
  const col = cols.find((c) => c.key === sort.key) ?? cols[0];
  const sorted = sortRows(rows, col.get, sort.dir);
  return (
    <div className="t-scroll">
      <table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button className="t-th" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                  {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={onRow ? 'clickable' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : (c.get(r) ?? '–')}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length} className="muted">Nothing here yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function Bar({ label, value, max, text, color }: { label: string; value: number | null; max: number; text?: string; color?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="t-bar">
      <span className="t-bar-label">{label}</span>
      <span className="t-bar-track" role="img" aria-label={`${label}: ${text ?? (value ?? 'no data')}`}>
        <span className="t-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="t-bar-val">{value === null ? '–' : (text ?? Math.round(value))}</span>
    </div>
  );
}

export function DateStepper({ date, onChange, max }: { date: IsoDate; onChange: (d: IsoDate) => void; max?: IsoDate }) {
  return (
    <div className="row t-date">
      <button className="btn" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>‹</button>
      <input type="date" aria-label="Date" value={date} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button className="btn" aria-label="Next day" onClick={() => onChange(addDays(date, 1))} disabled={!!max && date >= max}>›</button>
    </div>
  );
}

/** Password input with a show/hide toggle (a typo is the most common join problem on a phone). */
export function PasswordField({ label = 'Password', value, onChange, autoComplete, hint }: {
  label?: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="t-field">
      <label className="t-field-label">{label}
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} required
          autoComplete={autoComplete} minLength={autoComplete === 'new-password' ? 8 : undefined} />
      </label>
      <div className="row t-pw-row">
        {hint && <span className="muted t-hint">{hint}</span>}
        <button type="button" className="btn t-link" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide password' : 'Show password'}</button>
      </div>
    </div>
  );
}
