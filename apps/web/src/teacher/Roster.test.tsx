// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  roster: vi.fn(), joinRequests: vi.fn(), approve: vi.fn(), reject: vi.fn(),
}));
vi.mock('../shared/api.ts', async (orig) => {
  const m = await orig<typeof import('../shared/api.ts')>();
  return {
    ...m,
    api: {
      ...m.api,
      roster: h.roster, joinRequests: h.joinRequests, approveJoinRequest: h.approve, rejectJoinRequest: h.reject,
      listClasses: () => Promise.resolve([]),
    },
  };
});

import { Roster } from './Roster.tsx';

const student = (id: number, rollNo: number, firstName: string, pin = '4821') => ({
  id, classId: 1, rollNo, firstName, avatar: '🦁', pin, active: true, firstLoginAt: null, lastLoginAt: null, locked: false,
});

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={['/teacher/classes/1/students']}>
      <Routes><Route path="/teacher/classes/:classId/students" element={<Roster />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.roster.mockResolvedValue([student(1, 1, 'Riya')]);
  h.joinRequests.mockResolvedValue([{ id: 7, firstName: 'Meera', requestedRollNo: null, createdAt: '2026-11-20T10:00:00Z' }]);
  h.approve.mockResolvedValue(student(9, 2, 'Meera', '7305'));
  h.reject.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); h.roster.mockReset(); h.joinRequests.mockReset(); h.approve.mockReset(); h.reject.mockReset(); });

describe('Roster: Waiting to join', () => {
  it('shows the card, approves with a roll number and shows the new PIN', async () => {
    renderRoster();
    await screen.findByText('Waiting to join (1)');
    fireEvent.change(screen.getByLabelText('Roll number for Meera'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText(/Meera is in\. PIN: 7305/);
    expect(h.approve).toHaveBeenCalledWith(1, 7, { rollNo: 2 });
    expect(screen.queryByText(/Waiting to join/)).toBeNull();
    expect(screen.getAllByText('Meera').length).toBeGreaterThan(0); // now in the roster table
  });

  it('shows a clear message when the roll number is taken', async () => {
    h.approve.mockRejectedValue(new Error('Roll number 2 is already taken. Choose another number.'));
    renderRoster();
    await screen.findByText('Waiting to join (1)');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText(/Roll number 2 is already taken/);
    expect(screen.getByText('Waiting to join (1)')).toBeTruthy();
  });

  it('removes a request after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderRoster();
    await screen.findByText('Waiting to join (1)');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText(/Waiting to join/)).toBeNull());
    expect(h.reject).toHaveBeenCalledWith(1, 7);
  });

  it('is hidden when nobody is waiting', async () => {
    h.joinRequests.mockResolvedValue([]);
    renderRoster();
    await screen.findByText('Riya');
    expect(screen.queryByText(/Waiting to join/)).toBeNull();
  });
});
