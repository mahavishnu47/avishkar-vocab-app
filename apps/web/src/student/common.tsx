import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { StudentHomeRes, Student } from '@shabd/core';
import { ApiRequestError, getToken, setToken } from '../shared/api.ts';
import { onStatusChange } from '../shared/outbox.ts';
import './student.css';

export const LS = {
  classCode: 'shabd.classCode',
  showMarathi: 'shabd.showMarathi',
  student: 'shabd.student',
  home: 'shabd.home',
};

export function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k: string, v: string | null): void {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
}
export function lsJson<T>(k: string): T | null { try { const s = lsGet(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; } }

export function storedStudent(): Student | null { return lsJson<Student>(LS.student); }
export function storedHome(): StudentHomeRes | null { return lsJson<StudentHomeRes>(LS.home); }

/** Any 401 clears the token and goes to /login. Returns true if it was handled. */
export function handleAuthError(e: unknown, nav: NavigateFunction): boolean {
  if (e instanceof ApiRequestError && e.status === 401) {
    setToken(null);
    nav('/login', { replace: true });
    return true;
  }
  return false;
}

export function useRequireToken(nav: NavigateFunction): boolean {
  const ok = !!getToken();
  useEffect(() => { if (!ok) nav('/login', { replace: true }); }, [ok, nav]);
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
