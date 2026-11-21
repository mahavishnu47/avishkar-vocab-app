/**
 * F8 statistics: pure functions, no dependencies. Used by the results service and unit-tested against reference values.
 * Anything that cannot be computed (n < 2, zero variance, empty input) returns null, never NaN or Infinity.
 */

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n - 1). null when n < 2. */
export function sd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/** (meanPost - meanPre) / meanPre * 100; null when meanPre is 0 or either mean is missing. */
export function pctImprovement(meanPre: number | null, meanPost: number | null): number | null {
  if (meanPre === null || meanPost === null || meanPre === 0) return null;
  return ((meanPost - meanPre) / meanPre) * 100;
}

// ---------------------------------------------------------------- t distribution

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln(Gamma(x)) for x > 0 (Lanczos approximation, g = 7). */
function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i]! / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaCf(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaCf(a, b, x)) / a;
  return 1 - (front * betaCf(b, a, 1 - x)) / b;
}

/** CDF of Student's t with df degrees of freedom. */
export function tCdf(t: number, df: number): number {
  if (!(df > 0) || Number.isNaN(t)) return NaN;
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  const tail = 0.5 * regIncBeta(df / (df + t * t), df / 2, 0.5); // P(T > |t|)
  return t >= 0 ? 1 - tail : tail;
}

/** Two-tailed p-value. */
export function tTwoTailedP(t: number, df: number): number {
  if (!(df > 0) || Number.isNaN(t)) return NaN;
  return Math.min(1, regIncBeta(df / (df + t * t), df / 2, 0.5));
}

/** Quantile of Student's t (inverse CDF) by bisection. p in (0, 1). */
export function tInv(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
  if (p === 0.5) return 0;
  let lo = -1;
  let hi = 1;
  while (tCdf(lo, df) > p && lo > -1e12) lo *= 2;
  while (tCdf(hi, df) < p && hi < 1e12) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-12 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- tests

export interface PairedTTest {
  n: number;
  meanDiff: number;
  sdDiff: number;
  t: number;
  df: number;
  /** two-tailed */
  p: number;
  /** 95% confidence interval of the mean difference */
  ci95: [number, number];
  /** Cohen's d_z = meanDiff / sdDiff */
  cohenDz: number;
}

/** Paired t-test on post - pre. null when n < 2, the arrays differ in length, or all differences are identical (zero variance). */
export function pairedTTest(pre: readonly number[], post: readonly number[]): PairedTTest | null {
  if (pre.length !== post.length || pre.length < 2) return null;
  const diffs = post.map((v, i) => v - pre[i]!);
  const n = diffs.length;
  const meanDiff = mean(diffs)!;
  const sdDiff = sd(diffs)!;
  if (!(sdDiff > 1e-12)) return null;
  const se = sdDiff / Math.sqrt(n);
  const df = n - 1;
  const t = meanDiff / se;
  const crit = tInv(0.975, df);
  return { n, meanDiff, sdDiff, t, df, p: tTwoTailedP(t, df), ci95: [meanDiff - crit * se, meanDiff + crit * se], cohenDz: meanDiff / sdDiff };
}

/** Cohen's d_z of a list of differences; null when it cannot be computed. */
export const cohenDz = (diffs: readonly number[]): number | null => {
  const s = sd(diffs);
  const m = mean(diffs);
  return s === null || m === null || !(s > 1e-12) ? null : m / s;
};

export interface WelchTTest {
  n1: number;
  n2: number;
  mean1: number;
  mean2: number;
  /** mean1 - mean2 */
  meanDiff: number;
  t: number;
  /** Welch-Satterthwaite */
  df: number;
  p: number;
  ci95: [number, number];
}

/** Welch's unequal-variance t-test of a vs b (a - b). null when either group has n < 2 or both variances are zero. */
export function welchTTest(a: readonly number[], b: readonly number[]): WelchTTest | null {
  if (a.length < 2 || b.length < 2) return null;
  const m1 = mean(a)!;
  const m2 = mean(b)!;
  const v1 = sd(a)! ** 2 / a.length;
  const v2 = sd(b)! ** 2 / b.length;
  const se2 = v1 + v2;
  if (!(se2 > 1e-24)) return null;
  const se = Math.sqrt(se2);
  const df = se2 ** 2 / (v1 ** 2 / (a.length - 1) + v2 ** 2 / (b.length - 1));
  const t = (m1 - m2) / se;
  const crit = tInv(0.975, df);
  return { n1: a.length, n2: b.length, mean1: m1, mean2: m2, meanDiff: m1 - m2, t, df, p: tTwoTailedP(t, df), ci95: [m1 - m2 - crit * se, m1 - m2 + crit * se] };
}

// ---------------------------------------------------------------- formatting / wording

/** "p < 0.001", "p = 0.034" (three decimals). */
export function formatP(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return 'p not available';
  return p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`;
}

/** Plain-English reading of a p-value for the teacher and the exhibition report. */
export function interpretP(p: number | null | undefined, meanDiff: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p) || meanDiff === null || meanDiff === undefined) {
    return 'Not enough data for a test yet (need at least 2 students with both tests, and scores that did not all change by the same amount).';
  }
  const dir = meanDiff >= 0 ? 'improvement' : 'drop';
  if (p < 0.01) return `p < 0.01: the ${dir} is very unlikely to be chance.`;
  if (p < 0.05) return `p < 0.05: the ${dir} is unlikely to be chance.`;
  return `p >= 0.05: the ${dir} could be due to chance; it is not statistically significant.`;
}
