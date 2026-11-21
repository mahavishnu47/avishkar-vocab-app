// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setToken } from '../../../shared/api.ts';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../shared/research/progress-api.ts', () => ({ progressApi: api }));

import Progress from '../Progress.tsx';

const row = (o: object) => ({
  daysActive: 2, daysCompleted: 1, wordsCompleted: 6, meaningFirstTryPct: 50, posFirstTryPct: 66.7, sentenceAvgPct: 71.2, recallPct: null, lastActive: '2026-11-20', grid: {}, ...o,
});
const data = {
  classId: 1, from: '2026-11-19', to: '2026-11-20', inStudy: true, days: ['2026-11-19', '2026-11-20'], wordsPerDay: 5,
  students: [
    row({ studentId: 11, rollNo: 1, firstName: 'Riya', studyCode: 'S01', grid: { '2026-11-19': 5, '2026-11-20': 1 } }),
    row({ studentId: 12, rollNo: 2, firstName: 'Aarav', studyCode: 'S02', wordsCompleted: 9, grid: { '2026-11-19': 2, '2026-11-20': null } }),
  ],
};

beforeEach(() => {
  setToken('staff', 't');
  api.get.mockReset().mockResolvedValue(data);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/classes/1/progress']}>
      <Routes><Route path="/teacher/classes/:classId/progress" element={<Progress />} /></Routes>
    </MemoryRouter>,
  );
}

describe('teacher progress page', () => {
  it('renders every metric, the percent chips and the printable grid', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Student progress' });
    expect(within(table).getByText('Riya')).toBeTruthy();
    expect(within(table).getAllByText('66.7%').length).toBe(2);
    expect(within(table).getAllByText('-').length).toBeGreaterThan(0); // recall has no data
    expect(screen.getByRole('heading', { name: 'Daily vocabulary assignment record' })).toBeTruthy();
    const grid = screen.getByLabelText('Daily vocabulary assignment record');
    expect(within(grid).getByText('D1')).toBeTruthy();
    expect(within(grid).getByText('Aarav')).toBeTruthy();
  });

  it('the study-code toggle hides every first name, on screen and in the print grid', async () => {
    renderPage();
    await screen.findByText('Aarav', { selector: 'a' });
    expect(document.body.textContent).toContain('Riya');
    fireEvent.click(screen.getByLabelText('Show study codes instead of names'));
    await waitFor(() => expect(document.body.textContent).not.toContain('Riya'));
    expect(document.body.textContent).not.toContain('Aarav');
    expect(screen.getAllByText('S01').length).toBe(2); // table + grid
    expect(screen.getAllByText('S02').length).toBe(2);
  });

  it('sorts by a column when its header is pressed', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Student progress' });
    const names = () => within(table).getAllByRole('link').map((a) => a.textContent);
    expect(names()).toEqual(['Riya', 'Aarav']);
    fireEvent.click(within(table).getByRole('button', { name: /Words done/ }));
    expect(names()).toEqual(['Aarav', 'Riya']);
    fireEvent.click(within(table).getByRole('button', { name: /Words done/ }));
    expect(names()).toEqual(['Riya', 'Aarav']);
  });
});
