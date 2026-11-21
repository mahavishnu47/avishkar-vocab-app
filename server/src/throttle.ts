/**
 * Brute-force protection for unauthenticated endpoints (B-03). Counters live in Postgres (table auth_throttle)
 * because serverless instances share no memory. Only FAILURES are counted, so normal use costs no extra writes.
 */
import type { Queryable } from './db/db.ts';
import { HttpError } from './http.ts';

export interface ThrottleRule { max: number; windowMs: number; lockMs: number }

/** Teacher login: 8 wrong passwords per email (or 30 per IP) in 15 minutes locks that key for 15 minutes. */
export const TEACHER_EMAIL_RULE: ThrottleRule = { max: 8, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const TEACHER_IP_RULE: ThrottleRule = { max: 30, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
/** Unknown class codes: 100 misses per IP in 15 minutes locks lookups for 15 minutes. Generous because a whole school may share one IP and kids mistype; still makes enumerating 6-character codes hopeless. */
export const ROSTER_MISS_RULE: ThrottleRule = { max: 100, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

const iso = (ms: number) => new Date(ms).toISOString();

/** Throws 429 while `key` is locked. */
export async function assertNotThrottled(db: Queryable, key: string): Promise<void> {
  const row = await db.get<{ locked_until: string | null }>('SELECT locked_until FROM auth_throttle WHERE key = ?', [key]);
  const until = row?.locked_until ? Date.parse(row.locked_until) : 0;
  if (until > Date.now()) {
    const mins = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
    throw new HttpError(429, 'locked', `Too many tries. Please wait ${mins} minute${mins === 1 ? '' : 's'} and try again`);
  }
}

/** Count one failure; locks the key when the rule's limit is reached inside its window. */
export async function recordFailure(db: Queryable, key: string, rule: ThrottleRule): Promise<void> {
  const now = Date.now();
  const cutoff = iso(now - rule.windowMs);
  const r = await db.run(
    `INSERT INTO auth_throttle (key, fails, window_start) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       fails = CASE WHEN auth_throttle.window_start < ? THEN 1 ELSE auth_throttle.fails + 1 END,
       window_start = CASE WHEN auth_throttle.window_start < ? THEN ? ELSE auth_throttle.window_start END
     RETURNING fails`,
    [key, iso(now), cutoff, cutoff, iso(now)],
  );
  if (Number(r.rows[0]!.fails) >= rule.max) {
    await db.run('UPDATE auth_throttle SET locked_until = ?, fails = 0 WHERE key = ?', [iso(now + rule.lockMs), key]);
  }
}

export async function clearFailures(db: Queryable, key: string): Promise<void> {
  await db.run('DELETE FROM auth_throttle WHERE key = ?', [key]);
}
