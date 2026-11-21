import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const tokens: string[] = [];
const behaviour: { next: (kind: string) => unknown } = { next: () => undefined };

vi.mock('../../shared/api.ts', () => {
  class ApiRequestError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
    get isNetwork() { return this.code === 'network'; }
  }
  const run = (kind: string, token: string) => async () => { calls.push(kind); tokens.push(token); const r = behaviour.next(kind); if (r instanceof Error) throw r; return r; };
  return {
    ApiRequestError,
    getToken: () => null,
    setToken: () => {},
    api: {
      withToken: (t: string) => ({
        postAttempts: run('attempts', t), postSentence: run('sentence', t), completeWord: run('completeWord', t), completeSession: run('completeSession', t),
      }),
    },
  };
});

import { ApiRequestError } from '../../shared/api.ts';
import { _resetForTests, enqueue, flush, onStatusChange, pendingCount } from '../../shared/outbox.ts';

const A = (n: number) => ({ kind: 'attempts' as const, sessionId: 1, body: { meaning: [{ clientId: 'c' + n, wordId: 'w', attemptNo: 1 as const, chosen: 'x', isCorrect: true, msElapsed: 1, clientTs: 't' }] } });

const P = (studentId: number, token: string | null) => ({ studentId, firstName: 'K' + studentId, avatar: '🦁', className: '5A', schoolName: 'S', classCode: 'K7Q2MX', token, lastUsedAt: studentId });
const seed = (ps: ReturnType<typeof P>[], active: number) => {
  localStorage.setItem('shabd.profiles.v1', JSON.stringify(ps));
  localStorage.setItem('shabd.activeStudentId', String(active));
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  seed([P(1, 'tok-1')], 1);
  tokens.length = 0;
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
      _resetForTests(); localStorage.clear(); seed([P(1, 'tok-1')], 1); calls.length = 0;
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

  describe('shared phones', () => {
    it('sends each queued item with its own child token, even after a switch', async () => {
      seed([P(1, 'tok-1'), P(2, 'tok-2')], 1);
      behaviour.next = () => new ApiRequestError(0, 'network', 'offline');
      enqueue(A(1));                 // child 1 plays offline
      await vi.advanceTimersByTimeAsync(0);
      seed([P(1, 'tok-1'), P(2, 'tok-2')], 2); // phone is handed to child 2
      enqueue(A(2));
      await vi.advanceTimersByTimeAsync(0);
      expect(pendingCount()).toBe(2);
      tokens.length = 0; calls.length = 0;
      behaviour.next = () => undefined;
      await flush();
      expect(tokens).toEqual(['tok-1', 'tok-2']);
      expect(pendingCount()).toBe(0);
    });

    it('keeps items whose child has no token and never uses another child token', async () => {
      seed([P(1, null), P(2, 'tok-2')], 2);
      enqueue({ ...A(1), studentId: 1 });
      enqueue({ ...A(2), studentId: 2 });
      await vi.advanceTimersByTimeAsync(0);
      expect(tokens).toEqual(['tok-2']);
      expect(pendingCount()).toBe(1);
      // child 1 types the PIN again
      seed([P(1, 'tok-1-new'), P(2, 'tok-2')], 1);
      await flush();
      expect(tokens).toEqual(['tok-2', 'tok-1-new']);
      expect(pendingCount()).toBe(0);
    });

    it('a failing child does not block another child', async () => {
      seed([P(1, 'tok-1'), P(2, 'tok-2')], 1);
      behaviour.next = () => { throw new ApiRequestError(0, 'network', 'x'); };
      enqueue({ ...A(1), studentId: 1 });
      await vi.advanceTimersByTimeAsync(0);
      behaviour.next = () => (tokens[tokens.length - 1] === 'tok-1' ? new ApiRequestError(500, 'internal', 'x') : undefined);
      enqueue({ ...A(2), studentId: 2 });
      await vi.advanceTimersByTimeAsync(0);
      expect(pendingCount()).toBe(1);
    });

    it('a 401 marks that child as needing their PIN', async () => {
      behaviour.next = () => new ApiRequestError(401, 'unauthorized', 'x');
      enqueue(A(1));
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(localStorage.getItem('shabd.profiles.v1')!)[0].token).toBeNull();
      expect(pendingCount()).toBe(1);
    });

    it('assigns old items without a studentId to the active profile once', () => {
      seed([P(1, 'tok-1'), P(2, 'tok-2')], 2);
      localStorage.setItem('shabd.outbox.v1', JSON.stringify([{ id: 'x', kind: 'completeSession', sessionId: 1, tries: 0, createdAt: 't' }]));
      _resetForTests();
      expect(pendingCount()).toBe(1);
      expect(JSON.parse(localStorage.getItem('shabd.outbox.v1')!)[0].studentId).toBe(2);
    });
  });
});
