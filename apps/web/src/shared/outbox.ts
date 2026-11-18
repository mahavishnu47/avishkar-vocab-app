/**
 * Offline outbox for student writes. OWNER: Lane C (student UI).
 * Simplified PRD F17: queue in localStorage, retry FIFO on 'online', on app focus and every 30 s
 * with backoff (5s, 15s, 60s, then 60s). Server endpoints are idempotent by clientId, so
 * re-sending is always safe. A 4xx other than 401/408/429 drops the item (logged to console);
 * network errors and 5xx keep it.
 *
 * Storage key: 'shabd.outbox.v1' -> OutboxItem[] (JSON). Must survive reloads.
 */
import type { AttemptsReq, SentenceReq } from '@shabd/core';

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

export function enqueue(item: NewOutboxItem): void {
  void item;
  throw new Error('not implemented');
}

/** Try to send everything now (FIFO, stops at first network failure). */
export async function flush(): Promise<void> {
  throw new Error('not implemented');
}

export function pendingCount(): number {
  throw new Error('not implemented');
}

/** Subscribe to '☁️ saved' / '⏳ waiting to save' indicator changes. Returns unsubscribe. */
export function onStatusChange(cb: (s: OutboxStatus, pending: number) => void): () => void {
  void cb;
  throw new Error('not implemented');
}

/** Install online/focus/interval listeners once at app start. */
export function startOutbox(): void {
  throw new Error('not implemented');
}
