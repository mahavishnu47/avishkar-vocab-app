// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TeacherApp from './TeacherApp.tsx';
import { installMock } from './dev-mock.ts';
import { setToken } from '../shared/api.ts';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/teacher/*" element={<TeacherApp />} /></Routes>
    </MemoryRouter>,
  );
}

beforeAll(() => { sessionStorage.setItem('teacher.mock', '1'); installMock(); });
beforeEach(() => setToken('mock-token'));
afterEach(() => { cleanup(); setToken('mock-token'); });

describe('teacher app (mock API)', () => {
  it('redirects to login without a token and logs in', async () => {
    setToken(null);
    renderAt('/teacher/classes/1/dashboard');
    await screen.findByRole('heading', { name: 'Log in' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@school.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText(/completed/);
  });

  it('paste-adds 3 students and shows their PINs', async () => {
    renderAt('/teacher/classes/1/roster');
    fireEvent.click(await screen.findByText('+ Add students'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '21, Asha\n22, Bala\n23, Chitra' } });
    fireEvent.click(screen.getByRole('button', { name: /Save 3 students/ }));
    await waitFor(() => expect(screen.getAllByText('New')).toHaveLength(3));
    const tr = screen.getByText('Chitra').closest('tr')!;
    expect(within(tr).getByText(/^\d{4}$/)).toBeTruthy();
  });

  it('renders 8 login cards per page worth of cards for active students', async () => {
    renderAt('/teacher/classes/1/cards');
    await screen.findByText('🖨 Print cards');
    expect(document.querySelectorAll('.t-card-login').length).toBeGreaterThanOrEqual(6);
  });

  it('overrides today\'s words and resets to auto', async () => {
    renderAt('/teacher/classes/1/words');
    await screen.findByText('Auto');
    fireEvent.click(screen.getAllByText('Change')[0]);
    const useBtn = (await screen.findAllByText('Use this'))[10];
    fireEvent.click(useBtn);
    fireEvent.click(screen.getByText('Save day'));
    await screen.findByText(/Saved\./);
    expect(screen.getByText('Edited')).toBeTruthy();
    fireEvent.click(screen.getByText('Reset to auto'));
    await screen.findByText(/Back to automatic/);
    await waitFor(() => expect(screen.getByText('Auto')).toBeTruthy());
  });

  it('analytics sorts by a column and shows weakness label', async () => {
    renderAt('/teacher/classes/1/analytics');
    await screen.findByText('Needs support: Silent letters');
    const sortBtn = screen.getByRole('button', { name: /Spelling strength/ });
    fireEvent.click(sortBtn);
    const first = () => document.querySelector('tbody tr td')!.textContent;
    const asc = first();
    fireEvent.click(screen.getByRole('button', { name: /Spelling strength/ }));
    expect(first()).not.toBe(asc);
  });

  it('student detail shows remedy and example', async () => {
    renderAt('/teacher/students/1');
    await screen.findByText(/Try:/);
    expect(screen.getAllByText(/whisper → wisper/).length).toBeGreaterThan(0);
  });
});
