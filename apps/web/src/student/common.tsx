import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { StudentHomeRes, Student } from '@shabd/core';
import { ApiRequestError, getToken } from '../shared/api.ts';
import { onStatusChange } from '../shared/outbox.ts';
import { speak } from '../shared/speech.ts';
import { getActiveId, getActiveProfile, homeKey, markNeedsPin } from './profiles.ts';
import './student.css';

export function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k: string, v: string | null): void {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
}
export function lsJson<T>(k: string): T | null { try { const s = lsGet(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; } }

/** The child who is playing now (from the active profile). */
export function storedStudent(): Student | null {
  const p = getActiveProfile();
  return p ? { id: p.studentId, classId: 0, rollNo: 0, firstName: p.firstName, avatar: p.avatar, active: true } : null;
}
/** Home cache is per child: shabd.home.<studentId>. */
export function storedHome(): StudentHomeRes | null {
  const id = getActiveId();
  return id === null ? null : lsJson<StudentHomeRes>(homeKey(id));
}
export function saveHome(h: StudentHomeRes): void {
  const id = getActiveId();
  if (id !== null) lsSet(homeKey(id), JSON.stringify(h));
}

/** Where a child whose token was rejected goes: straight to their PIN pad, else "Who's playing?". */
export function needsPinPath(): string {
  const p = getActiveProfile();
  return p && p.classCode ? `/j/${p.classCode}/pin/${p.studentId}` : '/who';
}

/** The active child's token was rejected: mark the profile "needs PIN" and route there. */
export function onStudentUnauthorized(nav: NavigateFunction): void {
  const id = getActiveId();
  const path = needsPinPath();
  if (id !== null) markNeedsPin(id);
  nav(path, { replace: true });
}

/** Any 401 marks the child "needs PIN" and goes to their PIN pad. Returns true if it was handled. */
export function handleAuthError(e: unknown, nav: NavigateFunction): boolean {
  if (e instanceof ApiRequestError && e.status === 401) {
    onStudentUnauthorized(nav);
    return true;
  }
  return false;
}

export function useRequireToken(nav: NavigateFunction): boolean {
  const ok = !!getToken('student');
  useEffect(() => { if (!ok) nav(getActiveId() === null ? '/' : needsPinPath(), { replace: true }); }, [ok, nav]);
  return ok;
}

export function NetChip() {
  const [s, setS] = useState<{ saved: boolean; n: number }>({ saved: true, n: 0 });
  useEffect(() => onStatusChange((st, n) => setS({ saved: st === 'saved', n })), []);
  return (
    <span className={`chip net ${s.saved ? 'saved' : 'waiting'}`} role="status">
      {s.saved ? '☁️ saved' : `⏳ waiting to save (${s.n})`}
    </span>
  );
}

export function TopBar({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-left">{left}</div>
      <div className="topbar-right">{right}<NetChip /></div>
    </header>
  );
}

export function Mitra({ say }: { say?: string }) {
  return (
    <div className="mitra" aria-hidden={!say}>
      <span className="mitra-bird">🦜</span>{say && <span className="mitra-say">{say}</span>}
    </div>
  );
}

/** Back arrow (top-left) + optional 🔊 button that reads the screen's instruction. */
export function ScreenHead({ onBack, say }: { onBack?: () => void; say?: string }) {
  return (
    <div className="screen-head">
      {onBack ? <button className="btn btn-icon small" aria-label="Back" onClick={onBack}>←</button> : <span />}
      {say ? <button className="btn btn-icon small" aria-label="Read it to me" onClick={() => void speak(say)}>🔊</button> : <span />}
    </div>
  );
}

/** Kid-friendly error text for the join / PIN flow. Every message says who to ask. */
export function kidError(e: unknown, fallback = 'Something went wrong. Ask a grown-up 🙂'): string {
  if (e instanceof ApiRequestError) {
    if (e.isNetwork) return 'No internet. Try again 🙂';
    if (e.status === 404) return 'This link is not working. Ask your teacher for a new one 🙂';
    if (e.status === 423) return 'Too many tries. Wait 5 minutes 🙂';
    if (e.status === 429) return e.message || 'Too many tries. Wait a few minutes 🙂';
    if (e.status >= 500) return 'Our app is busy. Try again soon 🙂';
  }
  return fallback;
}
