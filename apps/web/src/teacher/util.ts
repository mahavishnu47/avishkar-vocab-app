/** Pure helpers for the teacher UI (unit-tested in util.test.ts). */
import type { IsoDate } from '@shabd/core';
import { getToken } from '../shared/api.ts';

export interface RosterRow { rollNo: number; firstName: string }
export interface ParsedRoster {
  rows: RosterRow[];
  /** problems that block saving, in simple English ("Line 4: roll number 7 is used twice.") */
  errors: string[];
  /** friendly notes that do not block saving */
  notices: string[];
}

/** Most students the server accepts in one request. */
export const MAX_ROSTER_ROWS = 100;
const MAX_NAME_LEN = 30;

const HEADER_RE = /^(roll|sr\.?|s\.?\s?no\.?|no\.?|id)\b.*\b(name|student)\b|^(name|student|student name|first name)$/i;

function cleanCell(s: string): string {
  return s.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim();
}

/**
 * Parse a pasted class list or CSV text (spec 2.3). Accepted lines:
 *   `7, Riya` · `7 Riya` · `7. Riya` · `7<TAB>Riya` · `"7","Riya Patil"` (first word only) · `Riya` (roll is automatic).
 * Blank lines and a header line (`roll,name`, `Roll No  Name`) are ignored. Roll numbers for name-only lines continue
 * after the highest roll in the class and in the pasted text.
 */
export function parseRosterText(text: string, existingRolls: number[] = []): ParsedRoster {
  const errors: string[] = [];
  const notices: string[] = [];
  const seen = new Set<number>(existingRolls);
  type Item = { line: number; roll: number | null; name: string };
  const items: Item[] = [];
  let sawFullName = false;
  let first = true;

  text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (!line || /^[,;\t\s|]+$/.test(line)) return;
    if (first) { first = false; if (HEADER_RE.test(line.replace(/[,;\t|"_]+/g, ' ').replace(/\s+/g, ' ').trim())) return; }
    // roll number first: "7", "7.", "7,", "7)" then the rest
    const m = /^["']?(\d+)["']?\s*(?:[,;\t|.):-]\s*|\s+)?(.*)$/.exec(line);
    let roll: number | null = null;
    let rest = line;
    if (m) {
      if (m[1].length > 4) { errors.push(`Line ${lineNo}: roll number ${m[1]} is too long.`); return; }
      roll = Number(m[1]);
      rest = m[2];
    }
    // name = first non-empty cell after the roll (extra CSV columns are ignored)
    const cells = rest.split(/[,;\t|]/).map(cleanCell).filter(Boolean);
    const cell = cells[0] ?? '';
    if (!cell) { errors.push(`Line ${lineNo}: add a name after the number.`); return; }
    if (!/\p{L}/u.test(cell)) { errors.push(`Line ${lineNo}: "${cell.slice(0, 20)}" does not look like a name.`); return; }
    const words = cell.split(/\s+/).filter(Boolean);
    if (words.length > 1) sawFullName = true;
    const name = words[0].replace(/[.,]+$/, '');
    if (name.length > MAX_NAME_LEN) { errors.push(`Line ${lineNo}: the name is too long.`); return; }
    if (roll !== null && roll < 1) { errors.push(`Line ${lineNo}: roll number must be 1 or more.`); return; }
    if (roll !== null) {
      if (seen.has(roll)) {
        errors.push(existingRolls.includes(roll)
          ? `Line ${lineNo}: roll number ${roll} is already in this class.`
          : `Line ${lineNo}: roll number ${roll} is used twice.`);
        return;
      }
      seen.add(roll);
    }
    items.push({ line: lineNo, roll, name });
  });

  // automatic roll numbers continue after the highest one in use
  let next = Math.max(0, ...seen) + 1;
  const rows: RosterRow[] = items.map((it) => ({ rollNo: it.roll ?? next++, firstName: it.name }));
  if (rows.length > MAX_ROSTER_ROWS) errors.push(`You can add ${MAX_ROSTER_ROWS} students at a time. Save these first, then add the rest.`);
  if (sawFullName) notices.push('We keep first names only.');
  const byName = new Map<string, number>();
  for (const r of rows) { const k = r.firstName.toLowerCase(); byName.set(k, (byName.get(k) ?? 0) + 1); }
  const shown = new Set<string>();
  for (const r of rows) {
    const k = r.firstName.toLowerCase();
    if ((byName.get(k) ?? 0) > 1 && !shown.has(k)) {
      shown.add(k);
      notices.push(`Two students are called ${r.firstName}. They will see their roll number.`);
    }
  }
  return { rows: rows.slice(0, MAX_ROSTER_ROWS), errors, notices };
}

/** Only allow redirects into the staff areas (`/school...`, `/teacher...`). Returns null for anything else. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\\s]/.test(next) || next.includes('://')) return null;
  return /^\/(school|teacher)(?:[/?#]|$)/.test(next) ? next : null;
}

/** 'ABCD-EFGH' style class link without the protocol, for printing: 'https://x.app/j/K7Q2MX' -> 'x.app/j/K7Q2MX'. */
export function shortLink(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Copy to the clipboard with a select-and-copy fallback. Resolves true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
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
  const token = getToken('staff');
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
