import { useMemo } from 'react';
import type { JoinStudent } from '@shabd/core';
import { getProfile } from './profiles.ts';

export const LETTER_CHIPS_OVER = 24;

/** "Riya", or "Riya · 7" when another child in the class has the same first name. */
export function displayNames(students: JoinStudent[]): Map<number, string> {
  const count = new Map<string, number>();
  for (const s of students) { const k = s.firstName.trim().toLowerCase(); count.set(k, (count.get(k) ?? 0) + 1); }
  return new Map(students.map((s) => [s.id, (count.get(s.firstName.trim().toLowerCase()) ?? 0) > 1 ? `${s.firstName} · ${s.rollNo}` : s.firstName]));
}

/** Letters that are present, in order (A-Z, then # for anything else). */
export function presentLetters(students: JoinStudent[]): string[] {
  const set = new Set(students.map((s) => letterOf(s.firstName)));
  return [...set].sort();
}
export function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

export function isInAppBrowser(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /WhatsApp|; wv\)/i.test(ua);
}

/** Step 1: tap your name. Names only (never scores or PINs). */
export function PickName({ students, onPick }: { students: JoinStudent[]; onPick: (s: JoinStudent) => void }) {
  const names = useMemo(() => displayNames(students), [students]);
  const letters = useMemo(() => (students.length > LETTER_CHIPS_OVER ? presentLetters(students) : []), [students]);
  return (
    <>
      {letters.length > 0 && (
        <nav className="letters" aria-label="Jump to a letter">
          {letters.map((l) => (
            <button key={l} className="chip letter" onClick={() => document.getElementById(`L-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{l}</button>
          ))}
        </nav>
      )}
      <div className="grid2 names">
        {students.map((s, i) => {
          const l = letterOf(s.firstName);
          const first = letters.length > 0 && (i === 0 || letterOf(students[i - 1].firstName) !== l);
          return (
            <button key={s.id} id={first ? `L-${l}` : undefined} className="btn btn-tall name-tile" onClick={() => onPick(s)}>
              <span className="avatar">{s.avatar}</span>
              <span className="name">{names.get(s.id)}</span>
              {getProfile(s.id) && <span className="chip pos small-chip" aria-label="on this phone">✓</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
