// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Word } from '@shabd/core';

const postSentence = vi.hoisted(() => vi.fn());
vi.mock('../../shared/api.ts', async (orig) => {
  const real = await orig<typeof import('../../shared/api.ts')>();
  return { ...real, api: { ...real.api, postSentence } };
});
vi.mock('../../shared/outbox.ts', () => ({ enqueue: vi.fn(), flush: vi.fn(), pendingCount: () => 0 }));

import { WriteStage } from '../Play.tsx';
import { freshState } from '../play-logic.ts';
import type { PlayState } from '../play-logic.ts';

const word = {
  id: 'd001-2', word: 'brave', partOfSpeech: 'adjective', meaning: 'not afraid', distractorMeanings: ['a', 'b'],
  exampleSentence: 'The brave soldier saved us.', syllables: ['brave'], forms: [],
} as unknown as Word;

function Harness() {
  const [st, setSt] = useState<PlayState>(() => ({ ...freshState(7, 1), stage: 'write' as const }));
  return <MemoryRouter><WriteStage st={st} word={word} sessionId={7} words={[word]} nav={vi.fn() as never} update={(fn) => setSt((s) => fn(s))} /></MemoryRouter>;
}
const press = (k: string) => fireEvent.keyDown(window, { key: k });
afterEach(() => { cleanup(); postSentence.mockReset(); });

describe('WriteStage keystroke counter', () => {
  it('counts keystrokes and deletions and sends them with the sentence', async () => {
    postSentence.mockResolvedValue({
      evaluation: { gate: 'ok', rubric: { use: 1, grammar: 1, relevance: 1, length: 1 }, rawTotal: 4, errorCodes: [], feedback: [], confidence: 1, evaluator: 'rules-1' },
      counted: true, finalMarks: 10,
    });
    render(<Harness />);
    for (const k of 'I am brave x') press(k);
    press('Backspace'); // removes the x
    press('Backspace'); // removes the space
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(postSentence).toHaveBeenCalledTimes(1));
    const body = postSentence.mock.calls[0]![1] as { text: string; keystrokes: number; deletions: number };
    expect(body.text).toBe('I am brave');
    expect(body.keystrokes).toBe(12);
    expect(body.deletions).toBe(2);
  });
});
