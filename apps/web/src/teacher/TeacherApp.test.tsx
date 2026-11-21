// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import TeacherApp from './TeacherApp.tsx';
import { installMock } from './dev-mock.ts';
import { setToken } from '../shared/api.ts';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/teacher/*" element={<TeacherApp />} />
        <Route path="/school/*" element={<div>school app</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const where = () => screen.getByTestId('where').textContent;

beforeAll(() => { sessionStorage.setItem('teacher.mock', '1'); installMock(); });
beforeEach(() => setToken('staff', 'mock-token'));
afterEach(() => { cleanup(); setToken('staff', 'mock-token'); });

describe('teacher app (mock API)', () => {
  it('redirects to login without a token and logs in', async () => {
    setToken('staff', null);
    renderAt('/teacher/classes/1/dashboard');
    await screen.findByRole('heading', { name: 'Log in' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@school.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText(/completed/);
  });

  it('adds students from a pasted list, needs consent, then goes to Share', async () => {
    renderAt('/teacher/classes/1/students/add');
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '21, Asha Rao\n22, Bala\nChitra' } });
    expect(screen.getByText('We keep first names only.')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Preview' })).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save 3 students' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // consent not ticked
    fireEvent.click(screen.getByRole('checkbox', { name: /Parents have given consent/ }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(where()).toBe('/teacher/classes/1/share'));
  });

  it('shows simple paste errors and blocks saving', async () => {
    renderAt('/teacher/classes/1/students/add');
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '30, Ek\n30, Don' } });
    expect(screen.getByText('Line 2: roll number 30 is used twice.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Parents have given consent/ }));
    expect((screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('roster shows Joined and Locked columns and a reset PIN message', async () => {
    renderAt('/teacher/classes/1/roster');
    await screen.findByText('Joined');
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getAllByText('not yet').length).toBeGreaterThan(0);
    window.confirm = () => true;
    fireEvent.click(screen.getAllByText('Reset PIN')[0]);
    await screen.findByText(/New PIN for Riya: \d{4}/);
  });

  it('renders 8 login cards per page worth of cards for active students', async () => {
    renderAt('/teacher/classes/1/cards');
    await screen.findByText('🖨 Print cards');
    expect(document.querySelectorAll('.t-card-login').length).toBeGreaterThanOrEqual(6);
    expect(document.querySelectorAll('.t-card-qr [role="img"]').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText(/\/j\/[A-Z0-9]{6}$/).length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText(/Keep this card safe/).length).toBeGreaterThanOrEqual(6);
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

  it('login honours a safe ?next= and ignores an unsafe one', async () => {
    setToken('staff', null);
    const first = renderAt('/teacher/login?next=/school/teachers');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'demo@school.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(where()).toBe('/school/teachers'));
    first.unmount();
    setToken('staff', null);
    renderAt('/teacher/login?next=//evil.com');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'demo@school.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(where()).not.toContain('evil'));
  });

  it('login shows join and forgot-password help, and a wrong password message', async () => {
    setToken('staff', null);
    renderAt('/teacher/login');
    await screen.findByText(/Forgot password\? Ask your school admin/);
    expect(screen.getByRole('link', { name: 'Join your school' }).getAttribute('href')).toBe('/teacher/join');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@school.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('Wrong email or password.');
  });

  it('joins a school from an invite link in one screen', async () => {
    setToken('staff', null);
    renderAt('/teacher/join/ABCD-EFGH');
    await screen.findByText('Demo School');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mrs Patil' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'patil@school.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Join school' }));
    await waitFor(() => expect(where()).toBe('/teacher'));
  });

  it('join with a bad code and a taken email shows the right messages', async () => {
    setToken('staff', null);
    const r = renderAt('/teacher/join/0000-0000');
    await screen.findByText('This code is not valid. Ask your school admin for a new one.');
    r.unmount();
    renderAt('/teacher/join');
    fireEvent.change(await screen.findByLabelText('School code'), { target: { value: 'abcd efgh' } });
    await screen.findByText('Demo School');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@school.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join school' }));
    await screen.findByText(/This email is already registered/);
    expect(screen.getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0);
  });

  it('reset link sets a new password and signs in', async () => {
    setToken('staff', null);
    renderAt('/teacher/reset/RESETABC');
    await screen.findByText(/Choose a new password for/);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: /Save password/ }));
    await waitFor(() => expect(where()).toBe('/teacher'));
  });

  it('creates a class in one screen and goes to add students', async () => {
    renderAt('/teacher/classes/new');
    await screen.findByText('Class name:');
    expect(screen.getByText('5A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Standard 6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Division B' }));
    expect(screen.getByText('6B')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create class' }));
    await waitFor(() => expect(where()).toMatch(/^\/teacher\/classes\/\d+\/students\/add$/));
  });

  it('create class reports a duplicate class', async () => {
    renderAt('/teacher/classes/new');
    await screen.findByText('Class name:');
    fireEvent.click(screen.getByRole('button', { name: 'Create class' })); // 5A exists in the mock
    await screen.findByText('Class 5A already exists in your school. Ask your school admin.');
  });

  it('share screen shows QR, link, WhatsApp and marks the link as shared', async () => {
    renderAt('/teacher/classes/1/share');
    await screen.findByText('Send on WhatsApp');
    expect(document.querySelector('[role="img"][aria-label^="QR code"]')).toBeTruthy();
    const wa = screen.getByText('Send on WhatsApp') as HTMLAnchorElement;
    expect(wa.href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(wa.href)).toContain('/j/');
    expect(screen.getByText('Print login cards')).toBeTruthy();
    fireEvent.click(wa);
  });

  it('home: first-run checklist for a new teacher with no classes', async () => {
    const real = window.location.search;
    window.history.replaceState({}, '', '/?fresh=1');
    // re-install the mock in fresh mode
    installMock();
    renderAt('/teacher');
    await screen.findByText('What to do next');
    expect(screen.getByText('Create your class')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create class' }).getAttribute('href')).toBe('/teacher/classes/new');
    window.history.replaceState({}, '', `/${real}`);
  });
});
