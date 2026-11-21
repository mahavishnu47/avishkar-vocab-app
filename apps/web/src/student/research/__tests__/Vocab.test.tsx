// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { BankWord, RecallItem } from '@shabd/core';
import type { ReactElement } from 'react';
import { setToken } from '../../../shared/api.ts';

const api = vi.hoisted(() => ({ recallToday: vi.fn(), recallAnswers: vi.fn(), bank: vi.fn() }));
vi.mock('../../../shared/research/vocab-api.ts', () => ({ vocabApi: api, readBankCache: () => null, writeBankCache: () => {} }));
vi.mock('../../../shared/speech.ts', () => ({ speak: vi.fn(), speechSupported: () => false }));

import Recall from '../Recall.tsx';
import Bank, { filterBank } from '../Bank.tsx';
import { RevisionCard } from '../cards/RevisionCard.tsx';

const items: RecallItem[] = [
  { itemId: 'w1:meaning', wordId: 'w1', kind: 'meaning', word: 'kettle', prompt: 'What does "kettle" mean?', options: ['a pot for boiling water', 'a bed sheet', 'a warm cap'] },
  { itemId: 'w2:pos', wordId: 'w2', kind: 'pos', word: 'wash', prompt: 'Is "wash" a noun, verb, adjective or adverb?', options: ['noun', 'verb', 'adjective', 'adverb'] },
];
const word = (o: Partial<BankWord>): BankWord => ({ wordId: 'x', word: 'x', partOfSpeech: 'noun', meaning: 'm', exampleSentence: 'e.', bestSentence: null, stars: 2, recallPct: null, ...o });
const bankWords = [
  word({ wordId: 'a', word: 'kettle', partOfSpeech: 'noun', bestSentence: 'My kettle is hot.' }),
  word({ wordId: 'b', word: 'wash', partOfSpeech: 'verb' }),
  word({ wordId: 'c', word: 'happy', partOfSpeech: 'adjective' }),
];

const at = (path: string, el: ReactElement) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path={path} element={el} /><Route path="/play" element={<p>PLAY PAGE</p>} /><Route path="*" element={<p>ELSEWHERE</p>} /></Routes></MemoryRouter>);

beforeEach(() => { localStorage.clear(); setToken('student', 'tok'); Object.values(api).forEach((m) => m.mockReset()); });
afterEach(() => { cleanup(); setToken('student', null); });

describe('Recall page', () => {
  it('runs the taps, shows server-derived feedback and ends with a way to start today', async () => {
    api.recallToday.mockResolvedValue({ date: '2026-11-20', items, alreadyDone: false });
    api.recallAnswers.mockImplementation(async (a: { itemId: string; chosen: string }[]) => ({
      results: [a[0]!.itemId === 'w1:meaning'
        ? { itemId: 'w1:meaning', isCorrect: true, correctAnswer: 'a pot for boiling water', counted: true }
        : { itemId: 'w2:pos', isCorrect: false, correctAnswer: 'verb', counted: true }],
    }));
    at('/recall', <Recall />);
    fireEvent.click(await screen.findByRole('button', { name: 'a pot for boiling water' }));
    await screen.findByText('Great job!');
    expect(api.recallAnswers.mock.calls[0]![0][0]).toMatchObject({ itemId: 'w1:meaning', chosen: 'a pot for boiling water' });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Noun/ }));
    await screen.findByText(/Nice try! It is: Verb/);
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }));
    await screen.findByText('You remembered 1 of 2!');
    fireEvent.click(screen.getByRole('button', { name: /Start today/ }));
    await screen.findByText('PLAY PAGE');
  });

  it('says there is nothing to revise and still lets the child start', async () => {
    api.recallToday.mockResolvedValue({ date: 'd', items: [], alreadyDone: false });
    at('/recall', <Recall />);
    await screen.findByText(/Nothing to revise yet/);
    fireEvent.click(screen.getByRole('button', { name: /Start today/ }));
    await screen.findByText('PLAY PAGE');
  });

  it('never blocks the child when offline', async () => {
    api.recallToday.mockRejectedValue(new Error('offline'));
    at('/recall', <Recall />);
    await screen.findByText(/No internet/);
    expect(screen.getByRole('button', { name: /Start today/ })).toBeTruthy();
  });
});

describe('Bank page', () => {
  it('filters by word type and by search text', async () => {
    api.bank.mockResolvedValue({ words: bankWords });
    at('/bank', <Bank />);
    await screen.findByText('kettle');
    expect(screen.getByText('3 words')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verb' }));
    expect(screen.queryByText('kettle')).toBeNull();
    expect(screen.getByText('wash')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search words'), { target: { value: 'hap' } });
    expect(screen.queryByText('wash')).toBeNull();
    expect(screen.getByText('happy')).toBeTruthy();
  });

  it('shows the child\'s own sentence when a word is opened', async () => {
    api.bank.mockResolvedValue({ words: bankWords });
    at('/bank', <Bank />);
    fireEvent.click((await screen.findByText('kettle')).closest('button')!);
    await screen.findByText('My kettle is hot.');
  });

  it('filterBank combines type and text', () => {
    expect(filterBank(bankWords, 'noun', '').map((w) => w.word)).toEqual(['kettle']);
    expect(filterBank(bankWords, 'all', 'H').map((w) => w.word)).toEqual(['wash', 'happy']);
    expect(filterBank(bankWords, 'verb', 'ket')).toEqual([]);
  });
});

describe('RevisionCard', () => {
  it('shows the challenge only when there are words to revise', async () => {
    api.recallToday.mockResolvedValue({ date: 'd', items, alreadyDone: false });
    const home = {} as never;
    render(<MemoryRouter><RevisionCard home={home} /></MemoryRouter>);
    await screen.findByRole('button', { name: /Yesterday.s words challenge/ });
    expect(screen.getByRole('button', { name: /My Word Bank/ })).toBeTruthy();
    cleanup();
    api.recallToday.mockResolvedValue({ date: 'd', items: [], alreadyDone: false });
    render(<MemoryRouter><RevisionCard home={home} /></MemoryRouter>);
    await waitFor(() => expect(api.recallToday).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: /challenge/ })).toBeNull();
    expect(screen.getByRole('button', { name: /My Word Bank/ })).toBeTruthy();
  });
});
