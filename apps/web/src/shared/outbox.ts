/**
 * Offline outbox for student writes. OWNER: Lane C (student UI).
 * Queue in localStorage, retry FIFO on 'online', on app focus and every 30 s with backoff
 * (5s, 15s, 60s, then 60s). Server endpoints are idempotent by clientId, so re-sending is safe.
 * A 4xx other than 401/408/429 drops the item; network errors, 5xx, 401, 408, 429 keep it.
 *
 * Storage key: 'shabd.outbox.v1' -> OutboxItem[] (JSON). Survives reloads.
 */
import type { AttemptsReq, SentenceReq } from '@shabd/core';
import { api, ApiRequestError } from './api.ts';

export type OutboxItem =
  | { id: string; kind: 'attempts'; sessionId: number; body: AttemptsReq; tries: number; createdAt: string }
  | { id: string; kind: 'sentence'; sessionId: number; body: SentenceReq; tries: number; createdAt: string }
  | { id: string; kind: 'completeWord'; sessionId: number; wordId: string; tries: number; createdAt: string }
  | { id: string; kind: 'completeSession'; sessionId: number; tries: number; createdAt: string };

export type OutboxStatus = 'saved' | 'waiting';

export type NewOutboxItem =
  | { kind: 'attempts'; sessionId: number; body: AttemptsReq }
  | { kind: 'sentence'; sessionId: number; body: SentenceReq }
  | { kind: 'completeWord'; sessionId: number; wordId: string }
  | { kind: 'completeSession'; sessionId: number };

const KEY = 'shabd.outbox.v1';
const BACKOFF_MS = [5000, 15000, 60000];

let queue: OutboxItem[] | null = null;
let flushing: Promise<void> | null = null;
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
  } catch { queue = []; }
  return queue!;
}
function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(load())); } catch { /* storage full / blocked: keep in memory */ }
  const n = load().length;
  for (const cb of listeners) cb(n ? 'waiting' : 'saved', n);
}

export function enqueue(item: NewOutboxItem): void {
  load().push({ ...item, id: uuid(), tries: 0, createdAt: new Date().toISOString() } as OutboxItem);
  save();
  void flush();
}

async function send(it: OutboxItem): Promise<void> {
  switch (it.kind) {
    case 'attempts': await api.postAttempts(it.sessionId, it.body); break;
    case 'sentence': await api.postSentence(it.sessionId, it.body); break;
    case 'completeWord': await api.completeWord(it.sessionId, it.wordId); break;
    case 'completeSession': await api.completeSession(it.sessionId); break;
  }
}

function keepOnError(e: unknown): boolean {
  if (!(e instanceof ApiRequestError)) return true;
  if (e.isNetwork || e.status >= 500) return true;
  return e.status === 401 || e.status === 408 || e.status === 429;
}

/** Try to send everything now (FIFO, stops at first failure that must be kept). */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const q = load();
    let failed = false;
    while (q.length) {
      const it = q[0];
      try {
        await send(it);
        q.shift();
        save();
      } catch (e) {
        if (keepOnError(e)) {
          it.tries += 1;
          save();
          failed = true;
          break;
        }
        console.warn('outbox: dropping rejected item', it.kind, e);
        q.shift();
        save();
      }
    }
    clearTimeout(retryTimer);
    if (failed && q.length) {
      const t = BACKOFF_MS[Math.min(q[0].tries - 1, BACKOFF_MS.length - 1)] ?? 60000;
      retryTimer = setTimeout(() => void flush(), t);
    }
  })().finally(() => { flushing = null; });
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
