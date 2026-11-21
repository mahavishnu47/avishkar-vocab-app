/**
 * Offline outbox for student writes. OWNER: Lane C (student UI).
 * Queue in localStorage, retry FIFO on 'online', on app focus and every 30 s with backoff
 * (5s, 15s, 60s, then 60s). Server endpoints are idempotent by clientId, so re-sending is safe.
 * A 4xx other than 401/408/429 drops the item; network errors, 5xx, 401, 408, 429 keep it.
 * SHARED PHONES: every item carries the studentId that created it and is sent with THAT child's token
 * (api.withToken). An item whose child has no token stays queued until that child logs in again; it is
 * never sent with another child's token. A failure for one child never blocks another child's items.
 *
 * Storage key: 'shabd.outbox.v1' -> OutboxItem[] (JSON). Survives reloads.
 */
import type { AttemptsReq, SentenceReq } from '@shabd/core';
import { api, ApiRequestError } from './api.ts';
import { getActiveId, markNeedsPin, tokenFor } from '../student/profiles.ts';

interface Base { id: string; studentId: number; tries: number; createdAt: string }
export type OutboxItem =
  | (Base & { kind: 'attempts'; sessionId: number; body: AttemptsReq })
  | (Base & { kind: 'sentence'; sessionId: number; body: SentenceReq })
  | (Base & { kind: 'completeWord'; sessionId: number; wordId: string })
  | (Base & { kind: 'completeSession'; sessionId: number });

export type OutboxStatus = 'saved' | 'waiting';

export type NewOutboxItem =
  | { kind: 'attempts'; sessionId: number; body: AttemptsReq }
  | { kind: 'sentence'; sessionId: number; body: SentenceReq }
  | { kind: 'completeWord'; sessionId: number; wordId: string }
  | { kind: 'completeSession'; sessionId: number };
/** studentId defaults to the active profile (the child who is playing now). */
type Enqueue = NewOutboxItem & { studentId?: number };

const KEY = 'shabd.outbox.v1';
const BACKOFF_MS = [5000, 15000, 60000];

let queue: OutboxItem[] | null = null;
let flushing: Promise<void> | null = null;
let again = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;
const listeners = new Set<(s: OutboxStatus, pending: number) => void>();

function uuid(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function load(): OutboxItem[] {
  if (queue) return queue;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    queue = Array.isArray(parsed) ? parsed : [];
    // upgrade: old items had no studentId; they belong to whoever is active now (once)
    const active = getActiveId() ?? 0;
    let changed = false;
    for (const it of queue!) if (typeof it.studentId !== 'number') { it.studentId = active; changed = true; }
    if (changed) localStorage.setItem(KEY, JSON.stringify(queue));
  } catch { queue = []; }
  return queue!;
}
function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(load())); } catch { /* storage full / blocked: keep in memory */ }
  const n = load().length;
  for (const cb of listeners) cb(n ? 'waiting' : 'saved', n);
}

export function enqueue(item: Enqueue): void {
  const studentId = item.studentId ?? getActiveId() ?? 0;
  load().push({ ...item, studentId, id: uuid(), tries: 0, createdAt: new Date().toISOString() } as OutboxItem);
  save();
  void flush();
}

async function send(it: OutboxItem, token: string): Promise<void> {
  const c = api.withToken(token);
  switch (it.kind) {
    case 'attempts': await c.postAttempts(it.sessionId, it.body); break;
    case 'sentence': await c.postSentence(it.sessionId, it.body); break;
    case 'completeWord': await c.completeWord(it.sessionId, it.wordId); break;
    case 'completeSession': await c.completeSession(it.sessionId); break;
  }
}

function keepOnError(e: unknown): boolean {
  if (!(e instanceof ApiRequestError)) return true;
  if (e.isNetwork || e.status >= 500) return true;
  return e.status === 401 || e.status === 408 || e.status === 429;
}

/** Try to send everything now (FIFO per child; a kept failure pauses only that child's later items). */
export function flush(): Promise<void> {
  if (flushing) { again = true; return flushing; } // something was queued mid-flush: run another pass
  flushing = (async () => {
    const blocked = new Set<number>(); // children paused for this run (kept failure, or no token yet)
    let retryTries = 0;
    do {
    again = false;
    const q = load();
    for (;;) {
      const it = q.find((x) => !blocked.has(x.studentId)); // live queue: picks up items added mid-flush
      if (!it) break;
      const token = tokenFor(it.studentId);
      if (!token) { blocked.add(it.studentId); continue; } // waits for that child's next login
      try {
        await send(it, token);
        q.splice(q.indexOf(it), 1);
        save();
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) markNeedsPin(it.studentId);
        if (keepOnError(e)) {
          it.tries += 1;
          save();
          blocked.add(it.studentId);
          if (!(e instanceof ApiRequestError && e.status === 401)) retryTries = Math.max(retryTries, it.tries);
          continue;
        }
        console.warn('outbox: dropping rejected item', it.kind, e);
        q.splice(q.indexOf(it), 1);
        save();
      }
    }
    } while (again);
    clearTimeout(retryTimer);
    if (retryTries) {
      const t = BACKOFF_MS[Math.min(retryTries - 1, BACKOFF_MS.length - 1)] ?? 60000;
      retryTimer = setTimeout(() => void flush(), t);
    }
  })().finally(() => { flushing = null; if (again) { again = false; void flush(); } });
  return flushing;
}

export function pendingCount(): number {
  return load().length;
}

/** Subscribe to '☁️ saved' / '⏳ waiting to save' indicator changes. Called once immediately. */
export function onStatusChange(cb: (s: OutboxStatus, pending: number) => void): () => void {
  listeners.add(cb);
  const n = pendingCount();
  cb(n ? 'waiting' : 'saved', n);
  return () => { listeners.delete(cb); };
}

/** Install online/focus/interval listeners once at app start. */
export function startOutbox(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const go = () => { if (pendingCount()) void flush(); };
  window.addEventListener('online', go);
  window.addEventListener('focus', go);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  setInterval(go, 30000);
  go();
}

/** test helper */
export function _resetForTests(): void {
  queue = null; flushing = null; clearTimeout(retryTimer); listeners.clear();
}
