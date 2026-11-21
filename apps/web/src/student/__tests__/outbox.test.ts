import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const behaviour: { next: (kind: string) => unknown } = { next: () => undefined };

vi.mock('../../shared/api.ts', () => {
  class ApiRequestError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
    get isNetwork() { return this.code === 'network'; }
  }
  const run = (kind: string) => async () => { calls.push(kind); const r = behaviour.next(kind); if (r instanceof Error) throw r; return r; };
  return {
    ApiRequestError,
    api: { postAttempts: run('attempts'), postSentence: run('sentence'), completeWord: run('completeWord'), completeSession: run('completeSession') },
  };
});

import { ApiRequestError } from '../../shared/api.ts';
import { _resetForTests, enqueue, flush, onStatusChange, pendingCount } from '../../shared/outbox.ts';

const A = (n: number) => ({ kind: 'attempts' as const, sessionId: 1, body: { meaning: [{ clientId: 'c' + n, wordId: 'w', attemptNo: 1 as const, chosen: 'x', isCorrect: true, msElapsed: 1, clientTs: 't' }] } });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  _resetForTests();
  calls.length = 0;
  behaviour.next = () => undefined;
});

describe('outbox', () => {
  it('sends FIFO and empties', async () => {
    behaviour.next = () => { throw new ApiRequestError(0, 'network', 'x'); };
    enqueue(A(1)); enqueue({ kind: 'completeWord', sessionId: 1, wordId: 'w' }); enqueue({ kind: 'completeSession', sessionId: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(pendingCount()).toBe(3);
    calls.length = 0;
    behaviour.next = () => undefined;
    await flush();
    expect(calls).toEqual(['attempts', 'completeWord', 'completeSession']);
    expect(pendingCount()).toBe(0);
  });

  it('keeps items on network error and stops at the first failure', async () => {
    behaviour.next = () => new ApiRequestError(0, 'network', 'offline');
    enqueue(A(1)); enqueue(A(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['attempts']);
    expect(pendingCount()).toBe(2);
  });

  it('keeps items on 5xx, 401, 429', async () => {
    for (const st of [500, 401, 429]) {
      _resetForTests(); localStorage.clear(); calls.length = 0;
      behaviour.next = () => new ApiRequestError(st, 'internal', 'x');
      enqueue(A(1));
      await vi.advanceTimersByTimeAsync(0);
      expect(pendingCount()).toBe(1);
    }
  });

  it('drops an item on 4xx (e.g. 400/404/409) and continues', async () => {
    let n = 0;
    behaviour.next = () => (n++ === 0 ? new ApiRequestError(400, 'bad_request', 'bad') : undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    enqueue(A(1)); enqueue(A(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['attempts', 'attempts']);
    expect(pendingCount()).toBe(0);
  });

  it('persists across reloads and retries with backoff', async () => {
    behaviour.next = () => new ApiRequestError(0, 'network', 'offline');
    enqueue(A(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(localStorage.getItem('shabd.outbox.v1')!)).toHaveLength(1);
    _resetForTests(); // simulate reload
    expect(pendingCount()).toBe(1);
    behaviour.next = () => undefined;
    calls.length = 0;
    await flush();
    expect(pendingCount()).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('retry timer flushes after 5 s', async () => {
    let fail = true;
    behaviour.next = () => (fail ? new ApiRequestError(0, 'network', 'offline') : undefined);
    enqueue(A(1));
    await vi.advanceTimersByTimeAsync(0);
    fail = false;
    await vi.advanceTimersByTimeAsync(5100);
    expect(pendingCount()).toBe(0);
  });

  it('reports status', async () => {
    const seen: string[] = [];
    onStatusChange((s, n) => seen.push(`${s}:${n}`));
    behaviour.next = () => new ApiRequestError(0, 'network', 'offline');
    enqueue(A(1));
    await vi.advanceTimersByTimeAsync(0);
    behaviour.next = () => undefined;
    await flush();
    expect(seen[0]).toBe('saved:0');
    expect(seen).toContain('waiting:1');
    expect(seen[seen.length - 1]).toBe('saved:0');
  });
});

describe('outbox poison items (B-08)', () => {
  it('drops an item that keeps failing with an unexpected error so later items still send', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    behaviour.next = (kind) => { if (kind === 'attempts') throw new SyntaxError('Unexpected token < in JSON'); return undefined; };
    enqueue(A(1)); enqueue({ kind: 'completeWord', sessionId: 1, wordId: 'w' });
    for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(61_000);
    expect(pendingCount()).toBe(0);
    expect(calls).toContain('completeWord');
  });
});
