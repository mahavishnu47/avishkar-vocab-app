// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StartAssessmentRes } from '@shabd/core';
import { ApiRequestError, setToken } from '../../../shared/api.ts';

const api = vi.hoisted(() => ({ current: vi.fn(), start: vi.fn(), save: vi.fn(), submit: vi.fn() }));
vi.mock('../../../shared/research/assessment-api.ts', () => ({ assessmentApi: api }));

import TestApp from '../TestApp.tsx';
import { TestCard } from '../cards/TestCard.tsx';

function session(over: Partial<StartAssessmentRes> = {}): StartAssessmentRes {
  const now = Date.now();
  return {
    windowId: 7, kind: 'pre', attempt: 'in_progress', startedAt: new Date(now).toISOString(), deadlineAt: new Date(now + 25 * 60_000).toISOString(), serverNow: new Date(now).toISOString(),
    items: [
      { id: 'a1', section: 'A', word: 'kettle', options: ['a pot for boiling water', 'a bed sheet', 'a sharp tool', 'a warm cap'] },
      { id: 'b1', section: 'B', sentence: 'Aai made a sweet pancake.', target: 'pancake', options: ['noun', 'verb', 'adjective', 'adverb'] },
      { id: 'c1', section: 'C', word: 'hall' },
    ],
    saved: [],
    ...over,
  };
}
const renderApp = () => render(<MemoryRouter initialEntries={['/test']}><TestApp /></MemoryRouter>);
const type = (s: string) => { for (const ch of s) fireEvent.keyDown(window, { key: ch }); };

beforeEach(() => {
  localStorage.clear();
  setToken('student', 'tok');
  Object.values(api).forEach((m) => m.mockReset());
  api.save.mockResolvedValue({ saved: 1, deadlineAt: '', serverNow: '' });
  api.submit.mockResolvedValue({ submitted: true });
});
afterEach(() => { cleanup(); setToken('student', null); });

describe('student test app', () => {
  it('says so when no test is open', async () => {
    api.current.mockResolvedValue({ assessment: null, serverNow: '' });
    renderApp();
    await screen.findByText('No test right now');
  });

  it('asks for the code, rejects a wrong one kindly, and starts with the right one', async () => {
    api.current.mockResolvedValue({ assessment: { windowId: 7, kind: 'pre', durationMin: 25, attempt: 'not_started', deadlineAt: null }, serverNow: '' });
    api.start.mockRejectedValueOnce(new ApiRequestError(403, 'forbidden', 'nope')).mockResolvedValueOnce(session());
    renderApp();
    const input = await screen.findByLabelText('Test code');
    fireEvent.change(input, { target: { value: 'ab-1' } });
    expect((input as HTMLInputElement).value).toBe('AB1');
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'ZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText('That code is not right. Ask your teacher.');
    fireEvent.change(input, { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText('Part A: What does it mean?');
    expect(api.start).toHaveBeenLastCalledWith(7, 'ABCD');
  });

  it('walks through the sections, autosaves each answer, backs up locally, types with the on-screen keyboard and shows no marks', async () => {
    api.current.mockResolvedValue({ assessment: { windowId: 7, kind: 'pre', durationMin: 25, attempt: 'in_progress', deadlineAt: null }, serverNow: '' });
    api.start.mockResolvedValue(session());
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Let's go/ }));
    expect(screen.getByRole('progressbar', { name: 'Time left' })).toBeTruthy();
    expect(screen.getByText('Question 1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'a pot for boiling water' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(7, [expect.objectContaining({ itemId: 'a1', answer: 'a pot for boiling water' })]));
    expect(JSON.parse(localStorage.getItem('shabd.test.7')!)).toEqual({ a1: 'a pot for boiling water' });

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Part B: What kind of word?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    expect(document.querySelector('u.test-target')!.textContent).toBe('pancake');
    fireEvent.click(screen.getByRole('button', { name: /Noun/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    expect(screen.getByText('Question 3 of 3')).toBeTruthy();
    type('The hall is big.');
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(7, [expect.objectContaining({ itemId: 'c1', answer: 'The hall is big.', keystrokes: expect.any(Number) })]));
    const lastC = api.save.mock.calls.map((c) => c[1][0]).filter((x) => x.itemId === 'c1').pop();
    expect(lastC.keystrokes).toBeGreaterThanOrEqual(16);
    fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    expect(screen.getByText('You answered every question.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Finish test/ }));
    await screen.findByText('Well done, you finished!');
    expect(api.submit).toHaveBeenCalledWith(7);
    expect(localStorage.getItem('shabd.test.7')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+\s*(\/|out of)\s*30|marks|score/i);
  });

  it('resumes an attempt in progress with its saved answers and no code', async () => {
    api.current.mockResolvedValue({ assessment: { windowId: 7, kind: 'pre', durationMin: 25, attempt: 'in_progress', deadlineAt: null }, serverNow: '' });
    api.start.mockResolvedValue(session({ saved: [{ itemId: 'a1', answer: 'a bed sheet' }] }));
    renderApp();
    await screen.findByText('Question 2 of 3'); // first unanswered
    expect(api.start).toHaveBeenCalledWith(7);
    expect(screen.queryByLabelText('Test code')).toBeNull();
  });

  it('auto-submits when the timer runs out', async () => {
    const now = Date.now();
    api.current.mockResolvedValue({ assessment: { windowId: 7, kind: 'pre', durationMin: 1, attempt: 'in_progress', deadlineAt: null }, serverNow: '' });
    api.start.mockResolvedValue(session({ startedAt: new Date(now - 59_000).toISOString(), deadlineAt: new Date(now + 1_200).toISOString(), serverNow: new Date(now).toISOString() }));
    renderApp();
    await screen.findByRole('progressbar', { name: 'Time left' });
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith(7), { timeout: 4000 });
    await screen.findByText('Well done, you finished!');
  });

  it('keeps answers and retries when the connection drops while finishing', async () => {
    api.current.mockResolvedValue({ assessment: { windowId: 7, kind: 'pre', durationMin: 25, attempt: 'in_progress', deadlineAt: null }, serverNow: '' });
    api.start.mockResolvedValue(session());
    api.save.mockReset();
    api.save.mockRejectedValueOnce(new ApiRequestError(0, 'network', 'offline')).mockResolvedValue({ saved: 1, deadlineAt: '', serverNow: '' });
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Let's go/ }));
    fireEvent.click(screen.getByRole('button', { name: 'a bed sheet' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1)); // failed, stays pending
    for (let i = 0; i < 2; i++) { fireEvent.click(screen.getByRole('button', { name: /Next/ })); const go = screen.queryByRole('button', { name: /Let's go/ }); if (go) fireEvent.click(go); }
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }).catch(() => screen.getByRole('button', { name: /Next|Review/ })));
    fireEvent.click(await screen.findByRole('button', { name: /Finish test/ }));
    await screen.findByText('Well done, you finished!', {}, { timeout: 4000 });
    const sent = api.save.mock.calls.flatMap((c) => c[1]).map((x: { itemId: string }) => x.itemId);
    expect(sent).toContain('a1');
    expect(api.submit).toHaveBeenCalledTimes(1);
  });
});

describe('home test card', () => {
  const home = {} as never;
  it('shows only while a test is open and not yet submitted', async () => {
    api.current.mockResolvedValue({ assessment: { windowId: 7, kind: 'pre', durationMin: 25, attempt: 'not_started', deadlineAt: null }, serverNow: '' });
    render(<MemoryRouter><TestCard home={home} /></MemoryRouter>);
    await screen.findByRole('button', { name: /Start the test/ });
    cleanup();
    api.current.mockResolvedValue({ assessment: { windowId: 7, kind: 'pre', durationMin: 25, attempt: 'submitted', deadlineAt: null }, serverNow: '' });
    const { container } = render(<MemoryRouter><TestCard home={home} /></MemoryRouter>);
    await waitFor(() => expect(api.current).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe('');
  });
});
