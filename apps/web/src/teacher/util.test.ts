import { describe, expect, it } from 'vitest';
import { ERROR_LABELS } from '@shabd/core';
import { addDays, filenameFromDisposition, heatStep, parseRosterText, safeNext, shortLink, sortRows, topCodes, whatsappUrl } from './util.ts';
import { codeFromLabel, REMEDIES } from './remedies.ts';

describe('parseRosterText', () => {
  const r = (t: string, ex: number[] = []) => parseRosterText(t, ex);
  it('refuses a pasted sentence instead of making a student called "a"', () => {
    const p = r('1, Meera\n2, a very very very long first name that goes on and on and on\n3, Om Prakash Kulkarni');
    expect(p.rows.map((x) => x.firstName)).toEqual(['Meera', 'Om']);
    expect(p.errors).toEqual(['Line 2: this looks like a sentence, not a name.']);
  });
  it('parses comma, tab, space and dot separated lines incl. Devanagari', () => {
    const p = r('1, Riya\n2\tArjun\n3 सानिका\n4. Kabir\n\n');
    expect(p.errors).toEqual([]);
    expect(p.rows).toEqual([
      { rollNo: 1, firstName: 'Riya' }, { rollNo: 2, firstName: 'Arjun' }, { rollNo: 3, firstName: 'सानिका' }, { rollNo: 4, firstName: 'Kabir' },
    ]);
  });
  it('keeps only the first word of a full name and says so', () => {
    const p = r('7, Riya Patil');
    expect(p.rows).toEqual([{ rollNo: 7, firstName: 'Riya' }]);
    expect(p.notices).toContain('We keep first names only.');
  });
  it('gives automatic roll numbers to name-only lines, continuing after the highest roll', () => {
    const p = r('Riya\nArjun\n20, Neha\nTara', [5, 9]);
    expect(p.rows.map((x) => x.rollNo)).toEqual([21, 22, 20, 23]);
    expect(r('Riya\nArjun').rows.map((x) => x.rollNo)).toEqual([1, 2]);
  });
  it('skips a header line and blank lines', () => {
    expect(r('roll,name\n1,Riya\n\n2,Arjun').rows).toHaveLength(2);
    expect(r('Roll No  Name\n1\tRiya').rows).toEqual([{ rollNo: 1, firstName: 'Riya' }]);
    expect(r('Name\nRiya\nArjun').rows.map((x) => x.firstName)).toEqual(['Riya', 'Arjun']);
  });
  it('reads CSV file text with CRLF, a BOM, quotes and extra columns', () => {
    const p = r('\uFEFFroll_no,first_name\r\n"1","Riya Patil"\r\n2,Arjun,Extra\r\n');
    expect(p.errors).toEqual([]);
    expect(p.rows).toEqual([{ rollNo: 1, firstName: 'Riya' }, { rollNo: 2, firstName: 'Arjun' }]);
  });
  it('flags duplicate rolls (pasted and existing) with simple messages', () => {
    const p = r('5, A\n5, B\n7, C', [7]);
    expect(p.rows).toEqual([{ rollNo: 5, firstName: 'A' }]);
    expect(p.errors).toEqual(['Line 2: roll number 5 is used twice.', 'Line 3: roll number 7 is already in this class.']);
  });
  it('flags a number with no name, roll 0 and a huge roll', () => {
    const p = r('6\n0, Zed\n20240001, Big');
    expect(p.rows).toEqual([]);
    expect(p.errors).toEqual(['Line 1: add a name after the number.', 'Line 2: roll number must be 1 or more.', 'Line 3: roll number 20240001 is too long.']);
  });
  it('notes duplicate first names', () => {
    expect(r('1, Riya\n2, Riya\n3, Om').notices).toEqual(['Two students are called Riya. They will see their roll number.']);
  });
  it('allows 100 rows and blocks 101', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}, Name${String.fromCharCode(97 + (i % 26))}${i}`).join('\n');
    expect(r(many(100)).errors).toEqual([]);
    const over = r(many(101));
    expect(over.errors).toHaveLength(1);
    expect(over.rows).toHaveLength(100);
  });
});

describe('safeNext', () => {
  it('allows only /school and /teacher paths', () => {
    expect(safeNext('/school')).toBe('/school');
    expect(safeNext('/school/teachers')).toBe('/school/teachers');
    expect(safeNext('/teacher/classes/1/roster?x=1')).toBe('/teacher/classes/1/roster?x=1');
    for (const bad of ['//evil.com', 'https://evil.com', '/schoolx', '/admin', '/', '', null, undefined, '/teacher\\evil', '/school://x', 'school'])
      expect(safeNext(bad as string | null)).toBeNull();
  });
});

describe('links', () => {
  it('builds whatsapp urls and short links', () => {
    expect(whatsappUrl('a b&c')).toBe('https://wa.me/?text=a%20b%26c');
    expect(shortLink('https://shabd.app/j/K7Q2MX')).toBe('shabd.app/j/K7Q2MX');
  });
});

describe('sortRows', () => {
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: null }, { n: 'c', v: 9 }, { n: 'd', v: 1 }];
  it('sorts numbers asc/desc with nulls always last', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.n)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.n)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('sorts strings naturally', () => {
    expect(sortRows([{ s: 'r10' }, { s: 'r2' }], (r) => r.s, 'asc').map((r) => r.s)).toEqual(['r2', 'r10']);
  });
});

describe('heatStep', () => {
  it('uses 4 steps relative to the class rate', () => {
    expect(heatStep(0, 0, 0.1)).toBe(0);
    expect(heatStep(2, 0.05, 0.1)).toBe(1);
    expect(heatStep(3, 0.12, 0.1)).toBe(2);
    expect(heatStep(10, 0.2, 0.1)).toBe(3);
  });
});

describe('misc helpers', () => {
  it('topCodes ranks by total', () => {
    expect(topCodes([{ a: 1, b: 5 }, { a: 2, c: 4 }], 2)).toEqual(['b', 'c']);
  });
  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('reads filename from Content-Disposition', () => {
    expect(filenameFromDisposition('attachment; filename="5A-attempts-2026-11-20.csv"', 'x.csv')).toBe('5A-attempts-2026-11-20.csv');
    expect(filenameFromDisposition(null, 'x.csv')).toBe('x.csv');
  });
});

describe('remedies', () => {
  it('has a remedy for every spelling and sentence code except CORRECT', () => {
    for (const code of Object.keys(ERROR_LABELS)) {
      if (code.startsWith('MN_') || code === 'SP_CORRECT') continue;
      expect(REMEDIES[code as keyof typeof REMEDIES], code).toBeTruthy();
    }
  });
  it('maps weakness labels back to codes', () => {
    expect(codeFromLabel('Needs support: Silent letters')).toBe('SP_SILENT');
    expect(codeFromLabel('Needs support: Nope')).toBeNull();
  });
});
