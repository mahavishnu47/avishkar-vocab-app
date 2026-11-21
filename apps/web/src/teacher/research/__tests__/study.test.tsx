// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { StudyParticipant } from '@shabd/core';
import StudyPages from '../StudyPages.tsx';
import { setToken } from '../../../shared/api.ts';

const participants: StudyParticipant[] = [
  { studentId: 11, studyCode: 'S01', group: 'intervention', classId: 1, className: '5A', rollNo: 1, firstName: 'Riya', consent: 'pending', excluded: false, analysable: false, consentUpdatedAt: null },
  { studentId: 12, studyCode: 'C01', group: 'comparison', classId: 2, className: '5B', rollNo: 1, firstName: 'Meera', consent: 'given', excluded: false, analysable: true, consentUpdatedAt: null },
];
const study = {
  id: 7, name: 'Word-a-Day', startDate: '2026-11-23', schoolDays: 20, wordsPerDay: 5, status: 'setup', createdAt: 'x',
  classes: [{ classId: 1, className: '5A', group: 'intervention', studentCount: 1 }],
  consent: { total: 2, pending: 1, given: 1, declined: 0, withdrawn: 0, excluded: 0, analysable: 1 },
};

let calls: { method: string; url: string; body: unknown }[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  setToken('staff', 't');
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url === '/api/classes') return json([]);
    if (url === '/api/auth/me') return json({ role: 'teacher', teacher: { role: 'teacher' } });
    if (url === '/api/studies' && method === 'GET') return json([study]);
    if (url === '/api/studies/7') return json(study);
    if (url === '/api/studies/7/participants/sync') return json(participants);
    if (url === '/api/studies/7/participants/11' && method === 'PATCH') return json({ ...participants[0], consent: 'given', analysable: true });
    return json({ error: { code: 'not_found', message: 'Not found' } }, 404);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/teacher/study/*" element={<StudyPages />} /></Routes>
  </MemoryRouter>,
);

describe('study pages', () => {
  it('lists studies with consent counts', async () => {
    renderAt('/teacher/study');
    expect(await screen.findByText('Word-a-Day')).toBeTruthy();
    expect(screen.getByText('Consent given: 1 of 2')).toBeTruthy();
  });

  it('consent select sends PATCH and updates the row', async () => {
    renderAt('/teacher/study/7/participants');
    const sel = (await screen.findByLabelText('Consent for S01')) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'given' } });
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/studies/7/participants/11')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ consent: 'given' });
    await waitFor(() => expect((screen.getByLabelText('Consent for S01') as HTMLSelectElement).value).toBe('given'));
  });

  it('exclude toggle sends PATCH with excluded', async () => {
    renderAt('/teacher/study/7/participants');
    fireEvent.click(await screen.findByLabelText('Exclude C01'));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  });

  it('renders the printable code sheet with codes and names, and a print button', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderAt('/teacher/study/7/codes');
    expect(await screen.findByText('S01')).toBeTruthy();
    expect(screen.getByText('Riya')).toBeTruthy();
    expect(screen.getByText('C01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Print' }).className).toContain('no-print');
  });
});
