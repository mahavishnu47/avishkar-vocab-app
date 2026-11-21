// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setToken } from '../../../shared/api.ts';

const api = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), patch: vi.fn(), results: vi.fn(), studentDetail: vi.fn(), override: vi.fn(), manual: vi.fn(), printForm: vi.fn(),
}));
vi.mock('../../../shared/research/assessment-api.ts', () => ({ assessmentApi: api }));

import Assessments from '../Assessments.tsx';

const win = { id: 5, classId: 1, kind: 'pre', formId: 'A', formVersion: 1, mode: 'app', durationMin: 25, accessCode: 'K7QM', status: 'open', openedAt: 'x', closedAt: null, studentCount: 2, started: 2, submitted: 1 };
const rows = [
  { studentId: 11, rollNo: 1, firstName: 'Riya', status: 'submitted', a: 9, b: 8, c: 5, total: 22, needsReview: 1, source: 'auto' },
  { studentId: 12, rollNo: 2, firstName: 'Aarav', status: 'in_progress', a: null, b: null, c: null, total: null, needsReview: 0, source: null },
];
const detail = {
  windowId: 5, studentId: 11, rollNo: 1, firstName: 'Riya', status: 'submitted', manual: null, a: 9, b: 8, c: 5, total: 22,
  items: [{ itemId: 'c1', section: 'C', prompt: 'Write your own sentence using "hall".', answer: 'The hall is big.', key: 'The school hall.', maxMarks: 2, autoMarks: 1, overrideMarks: null, finalMarks: 1, needsReview: true, detail: null }],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/classes/1/tests']}>
      <Routes><Route path="/teacher/classes/:classId/tests/*" element={<Assessments />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setToken('staff', 't');
  Object.values(api).forEach((m) => m.mockReset());
  api.list.mockResolvedValue([win]);
  api.results.mockResolvedValue({ window: win, rows });
  api.studentDetail.mockResolvedValue(detail);
  api.override.mockResolvedValue({ ok: true });
  api.manual.mockResolvedValue({ ok: true });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline')); // Page nav calls
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('teacher assessments page', () => {
  it('shows the code, live counts and the results table', async () => {
    renderPage();
    await screen.findByText('K7QM');
    expect(screen.getByText(/2 of 2 started · 1 submitted/)).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'Pre-test results' });
    expect(within(table).getByText('Riya')).toBeTruthy();
    expect(within(table).getByText('22')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create post-test' })).toBeTruthy();
  });

  it('overrides an item mark through the review form', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Review Riya' }));
    const select = await screen.findByLabelText('Marks for C1');
    fireEvent.change(select, { target: { value: '2' } });
    await waitFor(() => expect(api.override).toHaveBeenCalledWith(1, 5, 11, 'c1', 2));
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(api.override).toHaveBeenLastCalledWith(1, 5, 11, 'c1', null));
  });

  it('saves paper marks and rejects out-of-range ones', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Review Riya' }));
    const a = await screen.findByLabelText(/Section A/);
    fireEvent.change(a, { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText(/Section B/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Section C/), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save paper marks' }));
    await screen.findByText(/whole number from 0 to 10/);
    expect(api.manual).not.toHaveBeenCalled();
    fireEvent.change(a, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save paper marks' }));
    await waitFor(() => expect(api.manual).toHaveBeenCalledWith(1, 5, 11, { a: 7, b: 5, c: 6 }));
  });
});
