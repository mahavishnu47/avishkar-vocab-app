// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setToken } from '../../../shared/api.ts';

const api = vi.hoisted(() => ({ get: vi.fn(), review: vi.fn() }));
vi.mock('../../../shared/research/authenticity-api.ts', () => ({ authenticityApi: api }));

import Authenticity from '../Authenticity.tsx';

const data = {
  classId: 1, from: null, to: null,
  summary: { sentences: 10, noFlag: 8, flagged: 2, peerMatches: 1, teacherConfirmedCopy: 0, teacherConfirmedOwn: 0, noFlagPct: 80, ownWorkPct: 80 },
  students: [{ studentId: 11, rollNo: 1, firstName: 'Riya', sentences: 5, flagged: 0, notOwn: 0 }, { studentId: 12, rollNo: 2, firstName: 'Aarav', sentences: 5, flagged: 2, notOwn: 0 }],
  items: [{
    kind: 'daily', id: 42, studentId: 12, rollNo: 2, firstName: 'Aarav', word: 'brave', text: 'The farmer was very brave.', example: null, date: '2026-11-20',
    flags: ['peer_match', 'typing'], matchedFirstName: 'Riya', keystrokes: 3, deletions: 0, msElapsed: 1000, reviewStatus: null,
  }],
};

beforeEach(() => {
  setToken('staff', 't');
  api.get.mockReset().mockResolvedValue(data);
  api.review.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/classes/1/authenticity']}>
      <Routes><Route path="/teacher/classes/:classId/authenticity" element={<Authenticity />} /></Routes>
    </MemoryRouter>,
  );
}

describe('teacher sentence check page', () => {
  it('shows the own-work summary, reason chips and uses "check" wording', async () => {
    renderPage();
    await screen.findByText('The farmer was very brave.', { exact: false });
    expect(screen.getByLabelText('Own-work summary').textContent).toContain('80% of 10 sentences');
    expect(screen.getByText('Matches a classmate (Riya)')).toBeTruthy();
    expect(screen.getByText('Typing looks unusual')).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toContain('cheat');
  });

  it('review buttons send the status and toggle it off again', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Not own work' }));
    await waitFor(() => expect(api.review).toHaveBeenCalledWith(1, 'daily', 42, 'not_own'));
    fireEvent.click(screen.getByRole('button', { name: 'Own work' }));
    await waitFor(() => expect(api.review).toHaveBeenCalledWith(1, 'daily', 42, 'ok'));
  });
});
