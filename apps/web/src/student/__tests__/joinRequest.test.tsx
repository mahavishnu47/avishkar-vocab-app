import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ request: vi.fn(), status: vi.fn() }));
vi.mock('../../shared/api.ts', () => ({
  getToken: () => null, setToken: () => {},
  ApiRequestError: class extends Error { status = 0; isNetwork = false; },
  api: { requestToJoin: h.request, joinRequestStatus: h.status },
}));
vi.mock('../common.tsx', () => ({
  kidError: () => 'oops',
  ScreenHead: () => null,
}));

import { JoinRequestPage, POLL_MS } from '../JoinRequest.tsx';

const renderIt = () => render(
  <MemoryRouter initialEntries={['/j/ABC234/ask']}>
    <Routes>
      <Route path="/j/:classCode/ask" element={<JoinRequestPage />} />
      <Route path="/j/:classCode" element={<div>names page</div>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ shouldAdvanceTime: true }); h.status.mockResolvedValue({ status: 'pending', firstName: 'Meera' }); });
afterEach(() => { cleanup(); vi.useRealTimers(); h.request.mockReset(); h.status.mockReset(); });

describe('JoinRequestPage', () => {
  it('sends the request, remembers it, then polls until approved', async () => {
    h.request.mockResolvedValue({ requestId: 5, secret: 'sec' });
    renderIt();
    fireEvent.change(screen.getByLabelText('First name only'), { target: { value: ' Meera ' } });
    fireEvent.change(screen.getByLabelText(/Roll number/), { target: { value: '12' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask to join' })); });
    expect(h.request).toHaveBeenCalledWith('ABC234', { firstName: 'Meera', rollNo: 12 });
    await screen.findByText(/Waiting for your teacher/);
    expect(JSON.parse(localStorage.getItem('shabd.joinreq.ABC234')!)).toMatchObject({ requestId: 5, secret: 'sec' });
    expect(h.status).toHaveBeenCalledWith(5, 'sec');

    h.status.mockResolvedValue({ status: 'approved', firstName: 'Meera' });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 50); });
    await screen.findByText(/Ask your teacher for your PIN/);
  });

  it('restores a pending request after a refresh and shows Not approved', async () => {
    localStorage.setItem('shabd.joinreq.ABC234', JSON.stringify({ requestId: 8, secret: 's', firstName: 'Zoya' }));
    h.status.mockResolvedValue({ status: 'rejected', firstName: 'Zoya' });
    renderIt();
    await screen.findByText('Not approved');
    expect(h.request).not.toHaveBeenCalled();
  });

  it('stops polling when unmounted', async () => {
    localStorage.setItem('shabd.joinreq.ABC234', JSON.stringify({ requestId: 8, secret: 's', firstName: 'Zoya' }));
    const { unmount } = renderIt();
    await screen.findByText(/Waiting for your teacher/);
    unmount();
    h.status.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(h.status).not.toHaveBeenCalled();
  });
});
