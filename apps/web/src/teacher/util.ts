/** Pure helpers for the teacher UI (unit-tested in util.test.ts). */
import type { IsoDate } from '@shabd/core';
import { getToken } from '../shared/api.ts';

export interface RosterRow { rollNo: number; firstName: string }
export interface ParsedRoster { rows: RosterRow[]; errors: string[] }

/** Parse "roll, name" lines (comma, tab, or first space as separator). Flags bad lines and duplicate rolls. */
export function parseRosterText(text: string, existingRolls: number[] = []): ParsedRoster {
  const rows: RosterRow[] = [];
  const errors: string[] = [];
  const seen = new Set<number>(existingRolls);
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^(\d{1,4})\s*[,\t;]?\s*(.+)$/.exec(line);
    if (!m) { errors.push(`Line ${i + 1}: use "roll, name"`); return; }
    const rollNo = Number(m[1]);
    const firstName = m[2].replace(/^[,;\t\s]+/, '').trim();
    if (!firstName) { errors.push(`Line ${i + 1}: name is missing`); return; }
    if (rollNo < 1) { errors.push(`Line ${i + 1}: roll must be 1 or more`); return; }
    if (seen.has(rollNo)) { errors.push(`Line ${i + 1}: roll ${rollNo} already used`); return; }
    seen.add(rollNo);
    rows.push({ rollNo, firstName });
  });
  return { rows, errors };
}

export type SortDir = 'asc' | 'desc';
/** Stable sort; null/undefined always last regardless of direction. */
export function sortRows<T>(rows: readonly T[], get: (r: T) => string | number | null | undefined, dir: SortDir): T[] {
  const mul = dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined, bn = b.v === null || b.v === undefined;
      if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
      const c = typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: 'base' });
      return c * mul || a.i - b.i;
    })
    .map((x) => x.r);
}

/** Heatmap colour step 0..3 comparing a student's share to the class share. */
export function heatStep(count: number, studentRate: number, classRate: number | undefined): 0 | 1 | 2 | 3 {
  if (!count) return 0;
  if (classRate && studentRate >= 1.5 * classRate) return 3;
  if (classRate && studentRate >= classRate) return 2;
  return 1;
}

export function sum(o: Partial<Record<string, number>> | undefined): number {
  return Object.values(o ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** Top N codes by total count across students. */
export function topCodes<C extends string>(profiles: Partial<Record<C, number>>[], n: number): C[] {
  const tot = new Map<C, number>();
  for (const p of profiles) for (const [k, v] of Object.entries(p) as [C, number][]) tot.set(k, (tot.get(k) ?? 0) + v);
  return [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

// ---------------------------------------------------------------- dates (calendar arithmetic only; no timezone maths)
export function addDays(date: IsoDate, n: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function istToday(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export function filenameFromDisposition(h: string | null, fallback: string): string {
  const m = h && /filename="?([^";]+)"?/i.exec(h);
  return m ? m[1] : fallback;
}

/** Download a CSV with the bearer token (a plain link cannot send it). */
export async function downloadCsv(url: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get('content-disposition'), fallbackName);
  const a = document.createElement('a');
  const href = URL.createObjectURL(blob);
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
