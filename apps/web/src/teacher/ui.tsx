/** Shared teacher UI pieces: data hook, shell with nav, sortable table, bars, date stepper. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
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

/** One-line "what is this page for" shown under each page title, so nobody needs a manual. */
const PAGE_LEAD: Record<string, string> = {
  'My classes': "Your classes in one place. Open a class to see today's play, or add a new class.",
  Today: "Who has played today's five words, and how they did. Use the arrows to look at another day.",
  "Today's words": 'The five words children learn today. They are picked for you; change them if you like.',
  Roster: 'Every child in this class: login PINs, joining requests and PIN resets.',
  Leaderboard: 'Who earned the most XP. You can hide this from children if you prefer.',
  'Class analytics': 'Which words and skills the class finds hard, so you know what to revise on the board.',
  Progress: "Each child's days played, words completed and accuracy. You can print it.",
  'Research studies': 'A study compares test scores before and after children use WordWise. Start here to set one up.',
  'Word plan': 'The words taught on each study day. The first days include every word used in the tests.',
  'Observations and feedback': 'Weekly teacher observations and the end-of-study student questionnaire.',
  'Login cards': "Printable cards with each child's name, PIN and a QR code to open the class.",
  'Add students': 'Paste your class list. We only keep first names.',
  'Create class': 'A class is one standard and division, for example 5B.',
};

const LAST_CLASS_KEY = 'wordwise.lastClass';
export const rememberClass = (id: number): void => { try { localStorage.setItem(LAST_CLASS_KEY, String(id)); } catch { /* private mode */ } };

const CLASS_TABS: { to: string; label: string }[] = [
  { to: 'dashboard', label: 'Today' }, { to: 'words', label: 'Words' }, { to: 'roster', label: 'Roster' },
  { to: 'progress', label: 'Progress' }, { to: 'analytics', label: 'Analytics' }, { to: 'leaderboard', label: 'Leaderboard' },
  { to: 'tests', label: 'Tests' }, { to: 'authenticity', label: 'Sentence check' },
  { to: 'share', label: 'Share' }, { to: 'cards', label: 'Login cards' },
];

/**
 * Page frame. The top bar is the SAME on every teacher page (brand, My classes, Research study, School, Log out).
 * When a page belongs to a class, a second bar shows the class switcher and that class's tabs.
 */
export function Page({ classId, title, children, loading, error, className, lead }: {
  classId?: number; title?: string; children?: ReactNode; loading?: boolean; error?: string | null; className?: string; lead?: string;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
  useEffect(() => { if (classId && Number.isInteger(classId)) rememberClass(classId); }, [classId]);
  useEffect(() => { document.title = title ? `${title} · WordWise` : 'WordWise'; }, [title]);
  const tabsRef = useRef<HTMLElement | null>(null);
  useEffect(() => { tabsRef.current?.querySelector('a.active')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, [pathname]);
  const inClass = pathname.startsWith('/teacher/classes') || pathname.startsWith('/teacher/students');
  const inStudy = pathname.startsWith('/teacher/study');
  const onClasses = !inStudy && (pathname === '/teacher' || inClass);
  const topBar = (
    <nav className="t-nav no-print" aria-label="Main">
      <Link to="/teacher" className="t-brand">🦜 WordWise</Link>
      <Link to="/teacher" className={onClasses ? 'active' : ''} aria-current={onClasses ? 'page' : undefined}>My classes</Link>
      <Link to="/teacher/study" className={inStudy ? 'active' : ''} aria-current={inStudy ? 'page' : undefined}>Research study</Link>
      {isAdmin && <Link to="/school">School</Link>}
      <button className="btn t-logout" onClick={logout}>Log out</button>
    </nav>
  );
  // A typed/old link like /teacher/classes/abc/roster used to show "NaNNaN" in the header and a bare "Not found" (T-4).
  if (classId !== undefined && !Number.isInteger(classId)) {
    return (
      <main className="teacher screen t-page">
        {topBar}
        <h1 className="title t-title">We can't find that class</h1>
        <p className="muted">The link may be old or mistyped.</p>
        <Link className="btn btn-primary" to="/teacher">Go to my classes</Link>
      </main>
    );
  }
  const text = lead ?? (title ? PAGE_LEAD[title] : undefined);
  return (
    <main className={`teacher screen t-page ${className ?? ''}`}>
      {topBar}
      {classId && (
        <div className="t-classbar no-print">
          <label className="t-classpick">
            <span className="muted">Class</span>
            <select aria-label="Class" value={classId} onChange={(e) => navigate(e.target.value === 'all' ? '/teacher' : `/teacher/classes/${e.target.value}/dashboard`)}>
              {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="all">All classes…</option>
            </select>
          </label>
          <nav className="t-tabs" aria-label="Class pages" ref={tabsRef}>
            {CLASS_TABS.map((t) => <NavLink key={t.to} to={`${base}/${t.to}`}>{t.label}</NavLink>)}
          </nav>
        </div>
      )}
      {title && <h1 className="title t-title">{title}{cls ? <span className="muted t-sub"> · {cls.name} ({cls.classCode})</span> : null}</h1>}
      {text && !error && <p className="muted t-lead">{text}</p>}
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
