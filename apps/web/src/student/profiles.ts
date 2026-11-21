/**
 * Student profiles on this phone (docs/ONBOARDING_SPEC.md 5.2). Up to MAX_PROFILES children can share a phone.
 * localStorage['shabd.profiles.v1'] = Profile[]; localStorage['shabd.activeStudentId'] = active id.
 * The ACTIVE profile's token is mirrored into the api client's 'student' token slot.
 */
import type { StudentAuthRes } from '@shabd/core';
import { getToken, setToken } from '../shared/api.ts';
import { markStudentDevice, requestPersistentStorage } from '../shared/persist.ts';

export interface Profile {
  studentId: number;
  firstName: string;
  avatar: string;
  className: string;
  schoolName: string;
  classCode: string;
  /** null = "Type your PIN again" (rejected or cleared) */
  token: string | null;
  lastUsedAt: number;
}

export const MAX_PROFILES = 6;
const KEY = 'shabd.profiles.v1';
const ACTIVE_KEY = 'shabd.activeStudentId';
const LEGACY_STUDENT = 'shabd.student';
const LAST_LINK = 'shabd.lastLink';

function rd(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function wr(k: string, v: string | null): void { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } }

/** Saved data can be damaged (low storage, half-written save): only well-formed profiles are used (K-2). */
export function isProfile(x: unknown): x is Profile {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return Number.isInteger(p.studentId) && typeof p.firstName === 'string' && typeof p.avatar === 'string'
    && typeof p.classCode === 'string' && (p.token === null || typeof p.token === 'string');
}

export function getProfiles(): Profile[] {
  try {
    const p = JSON.parse(rd(KEY) ?? '[]');
    return Array.isArray(p) ? p.filter(isProfile).map((x) => ({ ...x, className: x.className ?? '', schoolName: x.schoolName ?? '', lastUsedAt: x.lastUsedAt ?? 0 })) : [];
  } catch { return []; }
}
function putProfiles(list: Profile[]): void { wr(KEY, JSON.stringify(list)); }

export function profilesByRecent(): Profile[] {
  return [...getProfiles()].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}
export function getProfile(studentId: number): Profile | null {
  return getProfiles().find((p) => p.studentId === studentId) ?? null;
}
export function getActiveId(): number | null {
  const n = Number(rd(ACTIVE_KEY));
  return n > 0 ? n : null;
}
export function getActiveProfile(): Profile | null {
  const id = getActiveId();
  return id === null ? null : getProfile(id);
}
/** Token to use for this child's queued writes (never another child's). */
export function tokenFor(studentId: number): string | null {
  return getProfile(studentId)?.token ?? null;
}

/** Make a profile the active one; its token goes into the api 'student' slot. */
export function setActive(studentId: number): Profile | null {
  const list = getProfiles();
  const p = list.find((x) => x.studentId === studentId);
  if (!p) return null;
  p.lastUsedAt = Date.now();
  putProfiles(list);
  wr(ACTIVE_KEY, String(studentId));
  setToken('student', p.token);
  return p;
}

/** The profile that adding `studentId` would push out (when the phone is full), else null. */
export function wouldEvict(studentId: number): Profile | null {
  const list = getProfiles();
  if (list.some((p) => p.studentId === studentId) || list.length < MAX_PROFILES) return null;
  return [...list].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
}

/** Save a fresh login as a profile and make it active. Drops the least recently used one if full. */
export function saveLogin(r: StudentAuthRes): Profile {
  let list = getProfiles().filter((p) => p.studentId !== r.student.id);
  while (list.length >= MAX_PROFILES) {
    const oldest = [...list].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
    list = list.filter((p) => p !== oldest);
    clearHome(oldest.studentId);
  }
  const p: Profile = {
    studentId: r.student.id, firstName: r.student.firstName, avatar: r.student.avatar, className: r.className,
    schoolName: r.schoolName, classCode: r.classCode, token: r.token, lastUsedAt: Date.now(),
  };
  list.push(p);
  putProfiles(list);
  wr(ACTIVE_KEY, String(p.studentId));
  setToken('student', p.token);
  markStudentDevice();
  void requestPersistentStorage(); // so the phone does not clear the profile when memory is low (P-1)
  return p;
}

/** The token was rejected (PIN reset, student turned off, expiry): ask for the PIN again. */
export function markNeedsPin(studentId: number): void {
  const list = getProfiles();
  const p = list.find((x) => x.studentId === studentId);
  if (!p) return;
  p.token = null;
  putProfiles(list);
  if (getActiveId() === studentId) setToken('student', null);
}

export function removeProfile(studentId: number): Profile | null {
  const list = getProfiles();
  const p = list.find((x) => x.studentId === studentId) ?? null;
  if (!p) return null;
  putProfiles(list.filter((x) => x.studentId !== studentId));
  clearHome(studentId);
  if (getActiveId() === studentId) { wr(ACTIVE_KEY, null); setToken('student', null); }
  return p;
}

// ---- per-student home cache
export const homeKey = (studentId: number) => `shabd.home.${studentId}`;
export function clearHome(studentId: number): void { wr(homeKey(studentId), null); }

// ---- last link used (for "+ Add a player")
export function setLastLink(path: string): void { wr(LAST_LINK, path); }
export function getLastLink(): string { const l = rd(LAST_LINK); return l && l.startsWith('/') ? l : '/login'; }

/**
 * Run once at student app start: turns an old single-student token (+ shabd.student) into the first profile,
 * and repairs the active id / token slot.
 */
export function initProfiles(): void {
  try {
    const list = getProfiles();
    const legacy = rd(LEGACY_STUDENT);
    const tok = getToken('student');
    if (legacy && tok && list.length === 0) {
      const s = JSON.parse(legacy) as { id: number; firstName: string; avatar: string };
      putProfiles([{
        studentId: s.id, firstName: s.firstName, avatar: s.avatar, className: '', schoolName: '',
        classCode: rd('shabd.classCode') ?? '', token: tok, lastUsedAt: Date.now(),
      }]);
      wr(ACTIVE_KEY, String(s.id));
      const oldHome = rd('shabd.home');
      if (oldHome) wr(homeKey(s.id), oldHome);
    }
    if (legacy) wr(LEGACY_STUDENT, null);
    wr('shabd.home', null);
    const now = getProfiles();
    if (now.length === 1 && getActiveId() === null) wr(ACTIVE_KEY, String(now[0].studentId));
    const active = getActiveProfile();
    if (active) { if (getToken('student') !== active.token) setToken('student', active.token); }
    else if (getToken('student')) setToken('student', null);
  } catch { /* ignore */ }
}

// ---- "chosen on this visit": a phone with several children asks "Who's playing?" once per visit
let chosenMem = false;
export function markChosen(): void {
  chosenMem = true;
  try { sessionStorage.setItem('shabd.chosen', '1'); } catch { /* ignore */ }
}
export function hasChosen(): boolean {
  if (chosenMem) return true;
  try { return sessionStorage.getItem('shabd.chosen') === '1'; } catch { return false; }
}
/** test helper: a fresh page load */
export function _resetChosenForTests(): void { chosenMem = false; }
