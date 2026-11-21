import { describe, expect, it } from 'vitest';
import { formatP, interpretP, mean, pairedTTest, pctImprovement, sd, tCdf, tInv, tTwoTailedP, welchTTest } from '../src/research/stats.ts';

describe('basic stats', () => {
  it('mean and sd (n-1)', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBeNull();
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
    expect(sd([5])).toBeNull();
    expect(sd([3, 3, 3])).toBe(0);
  });
  it('pctImprovement', () => {
    expect(pctImprovement(10, 15)).toBeCloseTo(50);
    expect(pctImprovement(0, 5)).toBeNull();
    expect(pctImprovement(null, 5)).toBeNull();
  });
});

describe('t distribution', () => {
  it('matches reference p-values', () => {
    expect(tTwoTailedP(2.5, 9)).toBeCloseTo(0.0339, 4);
    expect(tTwoTailedP(5, 29)).toBeCloseTo(2.5e-5, 6);
    expect(tTwoTailedP(0, 10)).toBeCloseTo(1, 10);
    expect(tTwoTailedP(2.228, 10)).toBeCloseTo(0.05, 3);
  });
  it('cdf is symmetric and the inverse round-trips', () => {
    expect(tCdf(0, 5)).toBeCloseTo(0.5, 12);
    expect(tCdf(-1.7, 12) + tCdf(1.7, 12)).toBeCloseTo(1, 12);
    expect(tInv(0.975, 9)).toBeCloseTo(2.2622, 4);
    expect(tInv(0.975, 29)).toBeCloseTo(2.0452, 4);
    expect(tInv(0.025, 9)).toBeCloseTo(-2.2622, 4);
    expect(tCdf(tInv(0.9, 7), 7)).toBeCloseTo(0.9, 9);
  });
});

describe('pairedTTest', () => {
  it('worked example', () => {
    // diffs 2,3,1,4,5 -> mean 3, sd sqrt(2.5)=1.5811, se=0.70711, t=4.2426, df=4
    const r = pairedTTest([10, 12, 8, 15, 9], [12, 15, 9, 19, 14])!;
    expect(r.n).toBe(5);
    expect(r.meanDiff).toBeCloseTo(3, 10);
    expect(r.sdDiff).toBeCloseTo(1.58114, 4);
    expect(r.t).toBeCloseTo(4.24264, 4);
    expect(r.df).toBe(4);
    expect(r.p).toBeCloseTo(0.01324, 3);
    expect(r.cohenDz).toBeCloseTo(1.8974, 4);
    expect(r.ci95[0]).toBeCloseTo(3 - 2.7764 * 0.70711, 3);
    expect(r.ci95[1]).toBeCloseTo(3 + 2.7764 * 0.70711, 3);
  });
  it('returns null for n < 2, mismatched lengths and zero variance', () => {
    expect(pairedTTest([1], [2])).toBeNull();
    expect(pairedTTest([], [])).toBeNull();
    expect(pairedTTest([1, 2], [3])).toBeNull();
    expect(pairedTTest([1, 2, 3], [4, 5, 6])).toBeNull();
  });
});

describe('welchTTest', () => {
  it('computes Welch t, df and p', () => {
    const r = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5])!;
    expect(r.meanDiff).toBe(4);
    expect(r.t).toBeCloseTo(4, 6); // se = sqrt(2.5/5 + 2.5/5) = 1
    expect(r.df).toBeCloseTo(8, 6);
    expect(r.p).toBeCloseTo(0.00394, 4);
  });
  it('handles small or constant groups', () => {
    expect(welchTTest([1], [1, 2])).toBeNull();
    expect(welchTTest([2, 2], [3, 3])).toBeNull();
  });
});

describe('wording', () => {
  it('formats p', () => {
    expect(formatP(0.0004)).toBe('p < 0.001');
    expect(formatP(0.0339)).toBe('p = 0.034');
    expect(formatP(null)).toBe('p not available');
  });
  it('interprets p in plain English', () => {
    expect(interpretP(0.03, 2)).toContain('p < 0.05');
    expect(interpretP(0.2, 2)).toContain('chance');
    expect(interpretP(null, null)).toContain('Not enough');
  });
});
