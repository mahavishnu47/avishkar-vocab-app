import { describe, expect, it } from 'vitest';
import { ERROR_LABELS } from '@shabd/core';
import { addDays, filenameFromDisposition, heatStep, parseRosterText, sortRows, topCodes } from './util.ts';
import { codeFromLabel, REMEDIES } from './remedies.ts';

describe('parseRosterText', () => {
  it('parses comma, tab and space separated lines incl. Devanagari', () => {
    const r = parseRosterText('1, Riya\n2\tArjun\n3 सानिका\n\n');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ rollNo: 1, firstName: 'Riya' }, { rollNo: 2, firstName: 'Arjun' }, { rollNo: 3, firstName: 'सानिका' }]);
  });
  it('flags bad lines and duplicate rolls (incl. existing)', () => {
    const r = parseRosterText('x, Bad\n5, A\n5, B\n7, C', [7]);
    expect(r.rows).toEqual([{ rollNo: 5, firstName: 'A' }]);
    expect(r.errors).toHaveLength(3);
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
