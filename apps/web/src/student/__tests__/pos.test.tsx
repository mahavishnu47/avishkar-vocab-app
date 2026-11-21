import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { Word } from '@shabd/core';

const enqueue = vi.fn();
vi.mock('../../shared/outbox.ts', () => ({ enqueue: (...a: unknown[]) => enqueue(...a), flush: vi.fn(), pendingCount: () => 0 }));

import { PosStage } from '../PosStage.tsx';
import { freshState, hasPosStage, normalizeState } from '../play-logic.ts';
import type { PlayState } from '../play-logic.ts';

const word = {
  id: 'd001-2', word: 'brave', partOfSpeech: 'adjective', meaning: 'not afraid', distractorMeanings: ['a', 'b'],
  exampleSentence: 'The brave soldier saved us.', syllables: ['brave'], forms: [],
} as unknown as Word;

let now = 1_000_000;
beforeEach(() => { enqueue.mockClear(); now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

let latest: PlayState;
function Harness({ initial }: { initial?: PlayState }) {
  const [st, setSt] = useState<PlayState>(() => initial ?? { ...freshState(7, 1), stage: 'pos' });
  latest = st;
  return <PosStage st={st} word={word} sessionId={7} update={(fn) => setSt((s) => fn(s))} />;
}
const tapBtn = (name: RegExp) => { fireEvent.click(screen.getByRole('button', { name })); now += 1000; };
const bodies = () => enqueue.mock.calls.map((c) => (c[0] as { body: { pos: Record<string, unknown>[] } }).body.pos[0]!);

describe('PosStage', () => {
  it('asks the question with the word highlighted and four big options with helper text', () => {
    render(<Harness />);
    expect(screen.getByText(/What kind of word is/).textContent).toContain('brave');
    expect(document.querySelector('mark')?.textContent).toBe('brave');
    for (const t of ['Noun', 'Verb', 'Adjective', 'Adverb']) expect(screen.getByRole('button', { name: new RegExp(t) })).toBeTruthy();
    expect(screen.getByText('(naming word)')).toBeTruthy();
    expect(screen.getByText('(how / when word)')).toBeTruthy();
  });

  it('a correct tap queues one attempt, shows Next, and Next moves to write', () => {
    now = 1_000_000 + 2500;
    const initial = { ...freshState(7, 1), stage: 'pos' as const, pos: { wrongTaps: [], done: false, t0: 1_000_000 } };
    render(<Harness initial={initial} />);
    tapBtn(/Adjective/);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const b = bodies()[0]!;
    expect(b).toMatchObject({ wordId: 'd001-2', attemptNo: 1, chosen: 'adjective', msElapsed: 2500 });
    expect(typeof b.clientId).toBe('string');
    expect(enqueue.mock.calls[0]![0]).toMatchObject({ kind: 'attempts', sessionId: 7 });
    expect(latest.pos.done).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(latest.stage).toBe('write');
  });

  it('a wrong tap shows a hint and allows one more try; a second wrong tap reveals the answer', () => {
    render(<Harness />);
    tapBtn(/^Noun/);
    expect(screen.getByRole('status').textContent).toMatch(/Try again/);
    expect(screen.getByRole('status').textContent).toMatch(/tells us more about/);
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
    expect((screen.getByRole('button', { name: /^Noun/ }) as HTMLButtonElement).disabled).toBe(true);
    tapBtn(/^Verb/);
    expect(screen.getByRole('status').textContent).toMatch(/brave is an adjective/);
    expect(bodies().map((x) => [x.attemptNo, x.chosen])).toEqual([[1, 'noun'], [2, 'verb']]);
    expect(screen.getByRole('button', { name: /Next/ })).toBeTruthy();
    // no third tap is possible
    fireEvent.click(screen.getByRole('button', { name: /^Adverb/ }));
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('right on the second try is recorded as attempt 2', () => {
    render(<Harness />);
    tapBtn(/^Verb/);
    tapBtn(/Adjective/);
    expect(bodies().map((x) => x.attemptNo)).toEqual([1, 2]);
    expect(latest.pos.done).toBe(true);
    expect(screen.getByRole('status').className).toContain('feedback-ok');
  });
});

describe('resume and routing', () => {
  it('a state saved before the POS stage existed gets a usable pos block', () => {
    const old = { ...freshState(7, 2) } as Partial<PlayState>;
    delete old.pos;
    const fixed = normalizeState(old as PlayState);
    expect(fixed.pos).toMatchObject({ wrongTaps: [], done: false });
    expect(typeof fixed.pos.t0).toBe('number');
    // an old session paused on the meaning check carries on to the pos stage without crashing
    render(<Harness initial={{ ...fixed, stage: 'pos' }} />);
    expect(screen.getByText(/What kind of word is/)).toBeTruthy();
  });

  it('an already-normalised state is returned unchanged', () => {
    const s = freshState(7, 0);
    expect(normalizeState(s)).toBe(s);
  });

  it('only noun, verb, adjective and adverb get the stage', () => {
    for (const p of ['noun', 'verb', 'adjective', 'adverb']) expect(hasPosStage({ partOfSpeech: p })).toBe(true);
    for (const p of ['preposition', 'conjunction', 'pronoun', 'interjection']) expect(hasPosStage({ partOfSpeech: p })).toBe(false);
  });
});
