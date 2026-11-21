import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StudentProgressRes } from '@shabd/core';

const studentProgress = vi.fn();
vi.mock('../../shared/api.ts', async (orig) => ({
  ...(await orig<typeof import('../../shared/api.ts')>()),
  getToken: () => 'tok',
  api: { studentProgress: () => studentProgress() },
}));
vi.mock('../profiles.ts', () => ({ getActiveId: () => 7, getActiveProfile: () => null, homeKey: (i: number) => `home.${i}`, markNeedsPin: vi.fn() }));
vi.mock('../../shared/outbox.ts', () => ({ onStatusChange: () => () => {}, pendingCount: () => 0 }));

import { Progress } from '../Progress.tsx';

const days = (played: number[]) => Array.from({ length: 14 }, (_, i) => ({
  date: `2026-11-${String(7 + i).padStart(2, '0')}`, played: played.includes(i), wordsDone: played.includes(i) ? 5 : 0,
  stars: played.includes(i) ? 12 : null, percent: played.includes(i) ? 80 : null,
}));
const full: StudentProgressRes = {
  totals: { daysPlayed: 4, wordsLearned: 17, currentStreak: 3, bestStreak: 5, xp: 900, level: { level: 1, xpIntoLevel: 400, xpForNextLevel: 1000 }, levelPercent: 40, xpToNextLevel: 600 },
  days: days([9, 11, 12, 13]),
  skills: [
    { key: 'spelling', percent: 90, label: 'Super' }, { key: 'meaning', percent: 60, label: 'Good' },
    { key: 'wordType', percent: 20, label: 'Keep practising' }, { key: 'sentence', percent: 55, label: 'Good' },
  ],
  wordsToPractise: [{ wordId: 'a', word: 'brave', stars: 0 }, { wordId: 'b', word: 'tiny', stars: 1 }],
  recentSessions: [{ sessionId: 1, date: '2026-11-20', wordsDone: 5, stars: 12 }],
};
const empty: StudentProgressRes = {
  totals: { daysPlayed: 0, wordsLearned: 0, currentStreak: 0, bestStreak: 0, xp: 0, level: { level: 0, xpIntoLevel: 0, xpForNextLevel: 500 }, levelPercent: 0, xpToNextLevel: 500 },
  days: days([]), skills: [], wordsToPractise: [], recentSessions: [],
};

const view = () => render(<MemoryRouter><Progress /></MemoryRouter>);
beforeEach(() => { studentProgress.mockReset(); localStorage.clear(); });
afterEach(cleanup);

describe('Progress screen', () => {
  it('shows level bar, streak, skills, words to practise and learned counter', async () => {
    studentProgress.mockResolvedValue(full);
    view();
    await waitFor(() => expect(screen.getByTestId('words-learned').textContent).toContain('17'));
    expect(screen.getByRole('progressbar', { name: 'Level progress' }).getAttribute('aria-valuenow')).toBe('40');
    expect(screen.getByText('600 more ⭐ to Level 3')).toBeTruthy();
    expect(screen.getByText(/🔥 3/)).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Spelling: Super' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Word type: Keep practising' })).toBeTruthy();
    expect(screen.getByText('brave')).toBeTruthy();
    expect(screen.getByText('You played on 4 of the last 14 days.')).toBeTruthy();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(14);
  });

  it('shows a friendly empty state', async () => {
    studentProgress.mockResolvedValue(empty);
    view();
    await waitFor(() => expect(screen.getByText('Play your first day!')).toBeTruthy());
    expect(screen.queryByText('My skills')).toBeNull();
    expect(screen.queryByText(/Words to practise/)).toBeNull();
  });

  it('falls back to the cached copy offline, else says no internet', async () => {
    studentProgress.mockResolvedValue(full);
    const a = view();
    await waitFor(() => screen.getByTestId('words-learned'));
    a.unmount();
    studentProgress.mockRejectedValue(new Error('offline'));
    view();
    expect(screen.getByTestId('words-learned').textContent).toContain('17');
    await waitFor(() => expect(screen.getByText('No internet. Showing saved info.')).toBeTruthy());
    cleanup();
    localStorage.clear();
    view();
    await waitFor(() => expect(screen.getByText('No internet 🙂')).toBeTruthy());
  });
});
