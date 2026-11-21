// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setToken } from '../../../shared/api.ts';

const api = vi.hoisted(() => ({
  studentFeedback: vi.fn(), postFeedback: vi.fn(), observations: vi.fn(), putObservation: vi.fn(), feedback: vi.fn(), setWindow: vi.fn(), putPaper: vi.fn(),
}));
vi.mock('../../../shared/research/instruments-api.ts', () => ({ instrumentsApi: api }));

import Instruments from '../Instruments.tsx';
import Feedback from '../../../student/research/Feedback.tsx';
import { FeedbackCard } from '../../../student/research/cards/FeedbackCard.tsx';

const empty = { accesses: null, meanings: null, pos: null, sentences: null, participates: null, revises: null };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  setToken('staff', 't');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/auth/me' ? json({ role: 'teacher', teacher: { role: 'teacher' } }) : json([]))));
  api.observations.mockResolvedValue({ studyId: 7, week: 1, rows: [{ studentId: 11, studyCode: 'S01', classId: 1, className: '5A', rollNo: 1, firstName: 'Riya', values: { ...empty }, observedOn: null }] });
  api.putObservation.mockResolvedValue({ ok: true });
  api.feedback.mockResolvedValue({ studyId: 7, open: false, openedAt: null, closedAt: null, rows: [], summary: { respondents: 0, items: [] } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('F9 teacher observation grid', () => {
  it('tapping Yes/No saves immediately with a PUT for that indicator, and tapping again clears it', async () => {
    render(<MemoryRouter initialEntries={['/teacher/study/7/instruments']}><Routes><Route path="/teacher/study/:studyId/instruments/*" element={<Instruments />} /></Routes></MemoryRouter>);
    const yes = await screen.findByLabelText('Riya: Understands word meanings: Yes');
    fireEvent.click(yes);
    await waitFor(() => expect(api.putObservation).toHaveBeenCalledWith(7, 11, 1, { meanings: true }));
    fireEvent.click(await screen.findByLabelText('Riya: Participates actively: No'));
    await waitFor(() => expect(api.putObservation).toHaveBeenCalledWith(7, 11, 1, { participates: false }));
    fireEvent.click(screen.getByLabelText('Riya: Understands word meanings: Yes'));
    await waitFor(() => expect(api.putObservation).toHaveBeenCalledWith(7, 11, 1, { meanings: null }));
  });
});

describe('F9 student feedback', () => {
  it('asks five questions one at a time and posts all five answers', async () => {
    api.studentFeedback.mockResolvedValue({ open: true, items: Array.from({ length: 5 }, (_, i) => ({ itemNo: i + 1, text: `Question text ${i + 1}` })), answers: [null, null, null, null, null] });
    api.postFeedback.mockResolvedValue({ ok: true });
    render(<MemoryRouter><Feedback /></MemoryRouter>);
    const picks = ['Yes', 'To some extent', 'No', 'Yes', 'Yes'];
    for (let i = 0; i < 5; i++) {
      await screen.findByText(`Question text ${i + 1}`);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(picks[i]!) }));
    }
    await screen.findByText(/Thank you/);
    expect(api.postFeedback).toHaveBeenCalledWith([
      { itemNo: 1, answer: 'yes' }, { itemNo: 2, answer: 'some' }, { itemNo: 3, answer: 'no' }, { itemNo: 4, answer: 'yes' }, { itemNo: 5, answer: 'yes' },
    ]);
  });

  it('the home card shows only while open and unanswered', async () => {
    const home = {} as never;
    api.studentFeedback.mockResolvedValue({ open: false, items: [], answers: [null, null, null, null, null] });
    const { container, rerender } = render(<MemoryRouter><FeedbackCard home={home} /></MemoryRouter>);
    await waitFor(() => expect(api.studentFeedback).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    api.studentFeedback.mockResolvedValue({ open: true, items: [], answers: [null, null, null, null, null] });
    rerender(<MemoryRouter key="b"><FeedbackCard home={home} /></MemoryRouter>);
    await screen.findByText(/Tell us what you think/);
  });
});
