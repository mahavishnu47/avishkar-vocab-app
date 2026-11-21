/**
 * Postgres-backed fixed-window rate limits (serverless-safe), keyed by a hashed client IP.
 * Contract: docs/ONBOARDING_SPEC.md 4.3. Tests set RATE_LIMIT_OFF=1 except the rate-limit test.
 */
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { getDb } from '../db/db.ts';
import { HttpError } from '../http.ts';

export const WINDOW_MIN = 10;

export const BUCKETS = {
  join: { limit: 120, message: 'Too many tries. Wait a few minutes 🙂' },
  pin: { limit: 60, message: 'Too many tries on this phone. Wait 10 minutes 🙂' },
  invite: { limit: 20, message: 'Too many tries. Wait 10 minutes.' },
  tlogin: { limit: 10, message: 'Too many tries. Wait 10 minutes or ask your school admin.' },
  admin: { limit: 5, message: 'Too many tries.' },
} as const;
export type Bucket = keyof typeof BUCKETS;

const off = () => process.env.RATE_LIMIT_OFF === '1';
const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** sha256(ip) prefix of the caller (trust proxy is on, so req.ip follows x-forwarded-for). */
export function clientKey(req: Request): string {
  return sha16(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
}

/** Extra key part (e.g. an email) hashed so no PII is stored. */
export const hashExtra = (s: string): string => sha16(s.trim().toLowerCase());

const windowStart = (): string => {
  const ms = WINDOW_MIN * 60_000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
};
const keyOf = (bucket: Bucket, ipKey: string, extra?: string) => `${bucket}:${ipKey}${extra ? `:${extra}` : ''}`;
const tooMany = (bucket: Bucket) => new HttpError(429, 'rate_limited', BUCKETS[bucket].message);

/** Count this call; throws 429 once the count passes the limit. */
export async function hit(bucket: Bucket, ipKey: string, extra?: string): Promise<void> {
  if (off()) return;
  const r = await getDb().get<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
    [keyOf(bucket, ipKey, extra), windowStart()],
  );
  if ((r?.count ?? 0) > BUCKETS[bucket].limit) throw tooMany(bucket);
}

/** Throw 429 when the bucket is already used up (does not count). Pair with recordHit on failures only. */
export async function checkLimit(bucket: Bucket, ipKey: string, extra?: string): Promise<void> {
  if (off()) return;
  const r = await getDb().get<{ count: number }>('SELECT count FROM rate_limits WHERE key = ? AND window_start = ?', [
    keyOf(bucket, ipKey, extra), windowStart(),
  ]);
  if ((r?.count ?? 0) >= BUCKETS[bucket].limit) throw tooMany(bucket);
}

/** Count one failure without throwing. */
export async function recordHit(bucket: Bucket, ipKey: string, extra?: string): Promise<void> {
  if (off()) return;
  await getDb().run(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1`,
    [keyOf(bucket, ipKey, extra), windowStart()],
  );
}
