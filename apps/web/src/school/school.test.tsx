// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AuditEntry } from '@shabd/core';
import SchoolApp from './SchoolApp.tsx';
import AdminApp from '../admin/AdminApp.tsx';
import { Landing } from '../landing/Landing.tsx';
import { installMock } from './dev-mock.ts';
import { setAdminSecret, setToken } from '../shared/api.ts';
import { describeAudit, joinedPct, safeNext, topClasses, whatsappUrl } from './util.ts';

function renderSchool(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/school/*" element={<SchoolApp />} />
        <Route path="/teacher/login" element={<div>TEACHER LOGIN</div>} />
        <Route path="/" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeAll(() => installMock());
beforeEach(() => { setToken('staff', 'mock-token'); setAdminSecret(null); });
afterEach(() => cleanup());

describe('helpers', () => {
  it('builds wa.me links, percentages and safe next paths', () => {
    expect(whatsappUrl('hi there')).toBe('https://wa.me/?text=hi%20there');
    expect(joinedPct(1, 3)).toBe(33);
    expect(joinedPct(0, 0)).toBe(0);
    expect(safeNext('/school/teachers')).toBe('/school/teachers');
    expect(safeNext('https://evil.com')).toBe('/school');
    expect(safeNext(null)).toBe('/school');
  });
  it('ranks classes and describes audit rows', () => {
    const top = topClasses([
      { name: '5A', teacherName: 'A', studentCount: 10, weekCompletionPct: 50 },
      { name: '5B', teacherName: 'B', studentCount: 10, weekCompletionPct: 80 },
      { name: '5C', teacherName: 'C', studentCount: 0, weekCompletionPct: 99 },
    ]);
    expect(top.map((c) => c.name)).toEqual(['5B', '5A']);
    const e: AuditEntry = { id: 1, at: '', actorType: 'teacher', actorName: 'Mrs. Patil', action: 'student.reset_pin', targetType: 'student', targetId: 1, targetLabel: 'Riya', meta: {} };
    expect(describeAudit(e)).toBe('Mrs. Patil reset the PIN of Riya');
  });
});

describe('landing', () => {
  it('shows 3 tiles with the right links and a contact footer', () => {
    renderSchool('/');
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/login', '/teacher/login', '/teacher/login?next=/school']);
    expect(screen.getByText(/New school\?/)).toBeTruthy();
  });
});

describe('school app (mock)', () => {
  it('redirects to teacher login without a token', async () => {
    setToken('staff', null);
    renderSchool('/school');
    await screen.findByText('TEACHER LOGIN');
  });

  it('activates a setup link and lands on the dashboard', async () => {
    setToken('staff', null);
    renderSchool('/school/setup/ABCD-EFGH');
    await screen.findByText(/Set up Zilla Parishad/);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Joshi' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'j@x.in' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    await screen.findByText('Getting started');
  });

  it('shows the expired message for a bad setup code', async () => {
    renderSchool('/school/setup/ZZZZZZZZ');
    await screen.findByText(/expired or was already used/);
  });

  it('shows checklist, totals, leaderboard and class rows; WhatsApp tick', async () => {
    renderSchool('/school');
    await screen.findByText('Getting started');
    expect(screen.getByText('Invite your teachers')).toBeTruthy();
    await screen.findByText(/Top classes this week/);
    expect(screen.getAllByText('5A').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Show link' }));
    const wa = await screen.findByText('WhatsApp');
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    fireEvent.click(wa);
    await screen.findByText('Setup complete ✅');
  });

  it('manages teachers: reset link, turn off, last admin guard', async () => {
    renderSchool('/school/teachers');
    await screen.findByText('Mrs. Patil');
    fireEvent.click(screen.getAllByText('Reset password')[0]);
    await screen.findByText(/Password link for/);
    fireEvent.click(screen.getByText('Done'));
    fireEvent.click(screen.getAllByText('Turn off')[1]);
    await screen.findAllByText('Turn on');
    fireEvent.click(screen.getAllByText('Remove admin')[0]);
    await screen.findByText('Your school needs at least one admin.');
  });

  it('lists classes and archives one', async () => {
    renderSchool('/school/classes');
    await screen.findByText('5B');
    fireEvent.click(screen.getAllByText('Archive')[1]);
    await waitFor(() => expect(screen.queryByText('5B')).toBeNull());
  });

  it('settings show the student link and activity', async () => {
    renderSchool('/school/settings');
    await screen.findByText('Student link');
    await screen.findByText(/reset the PIN of Riya/);
    expect(screen.getAllByTestId('share-url')[0].textContent).toContain('/s/DEMSCH');
  });
});

describe('super admin (mock)', () => {
  it('rejects a wrong secret, accepts the right one, creates a school and shows the link', async () => {
    render(<AdminApp />);
    fireEvent.change(screen.getByLabelText('Admin secret'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('Wrong secret.');
    expect(sessionStorage.getItem('shabd.adminSecret')).toBeNull();

    fireEvent.change(screen.getByLabelText('Admin secret'), { target: { value: 'test-secret-1234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('+ New school');
    expect(sessionStorage.getItem('shabd.adminSecret')).toBe('test-secret-1234567890');
    fireEvent.click(screen.getByText('+ New school'));
    fireEvent.change(screen.getByLabelText('School name'), { target: { value: 'Test School' } });
    fireEvent.change(screen.getByLabelText(/UDISE/), { target: { value: '123' } });
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/UDISE/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('Test School is ready');
    expect(screen.getByTestId('share-url').textContent).toContain('/a/SETUPABC');
    fireEvent.click(screen.getAllByText('Suspend')[0]);
    await screen.findByText('Suspended');
    fireEvent.click(screen.getByText('Sign out'));
    await screen.findByLabelText('Admin secret');
  });
});
