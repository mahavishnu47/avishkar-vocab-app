// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminActivityEntry, AdminOverview, AdminSchoolRow } from '@shabd/core';
import AdminApp from './AdminApp.tsx';
import { api, setAdminSecret } from '../shared/api.ts';

const school = (id: number, name: string, over: Partial<AdminSchoolRow> = {}): AdminSchoolRow => ({
  school: { id, name, district: 'Thane', studentCode: 'ABC234', status: 'active' }, udiseCode: null,
  teachers: 2, classes: 1, students: 30, createdAt: '2026-11-01T00:00:00.000Z',
  activeStudents7d: 12, lastActivityAt: '2026-11-20T05:00:00.000Z', lastTeacherLoginAt: null, studyRunning: false, ...over,
});
const overview = (over: Partial<AdminOverview['totals']> = {}): AdminOverview => ({
  totals: { schoolsActive: 2, schoolsSuspended: 1, teachers: 5, classes: 4, students: 90, joinRequestsPending: 3, studiesRunning: 1, ...over },
  activity: { studentsToday: 20, students7d: 40, students30d: 60, sessionsCompletedToday: 15, sessionsCompleted7d: 90, wordsCompleted7d: 450 },
  daily: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, activeStudents: i % 7, sessionsCompleted: i % 5 })),
  health: { db: 'ok', migrationsApplied: 11, latestMigration: 11, wordsLoaded: 1500, appVersion: '0.1.0', serverTime: '2026-11-20T05:00:00.000Z' },
  topSchools: [{ schoolId: 1, name: 'Alpha School', activeStudents7d: 12, students: 30 }],
});
const feed: AdminActivityEntry[] = [
  { id: 2, at: '2026-11-20T05:00:00.000Z', schoolId: 1, schoolName: 'Alpha School', actorType: 'teacher', action: 'class.create', targetType: 'class', targetId: 1 },
  { id: 1, at: '2026-11-19T05:00:00.000Z', schoolId: 2, schoolName: 'Beta School', actorType: 'super', action: 'school.suspend', targetType: 'school', targetId: 2 },
];

function mock(rows: AdminSchoolRow[], ov: AdminOverview, act: AdminActivityEntry[]) {
  Object.assign(api.admin, {
    listSchools: vi.fn().mockResolvedValue(rows),
    overview: vi.fn().mockResolvedValue(ov),
    activity: vi.fn().mockResolvedValue(act),
    schoolDetail: vi.fn().mockResolvedValue({
      row: rows[0], teachers: [{ id: 1, name: 'Mrs Patil', email: 'p@s.in', role: 'school_admin', active: true, lastLoginAt: null }],
      classes: [{ id: 1, name: '5A', classCode: 'ABC234', students: 30, active7d: 12, archived: false }], recentActivity: act,
    }),
  });
}

beforeEach(() => { setAdminSecret('test-secret-1234567890'); });
afterEach(() => { cleanup(); setAdminSecret(null); });

describe('admin dashboard', () => {
  it('renders overview, schools, detail and activity tabs', async () => {
    mock([school(1, 'Alpha School'), school(2, 'Beta School', { school: { id: 2, name: 'Beta School', district: '', studentCode: 'ZZZ234', status: 'suspended' }, studyRunning: true })], overview(), feed);
    render(<AdminApp />);
    await screen.findByText('Active schools');
    expect(screen.getByText('Join requests waiting')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Students who played each day/ })).toBeTruthy();
    expect(screen.getByText(/Migrations applied: 11/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Top schools' })).getByText(/Alpha School/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Schools' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Suspended')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search schools'), { target: { value: 'beta' } });
    expect(screen.queryByText('Alpha School')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search schools'), { target: { value: 'nomatch' } });
    expect(screen.getByText('No school matches your search.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search schools'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Open details for Alpha School' }));
    await screen.findByText('Mrs Patil');
    expect(screen.getByText('5A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All schools' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('2 of 2 recent events')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by action'), { target: { value: 'suspend' } });
    expect(screen.getByText('1 of 2 recent events')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by action'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('School'), { target: { value: 'Alpha School' } });
    expect(screen.getByText('1 of 2 recent events')).toBeTruthy();
  });

  it('shows empty states', async () => {
    mock([], { ...overview({ schoolsActive: 0, schoolsSuspended: 0 }), topSchools: [] }, []);
    render(<AdminApp />);
    await screen.findByText(/No schools yet. Add the first school/);
    expect(screen.getByText('No student activity in the last 7 days.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Schools' }));
    expect(screen.getByText('No schools yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('No activity yet.')).toBeTruthy();
  });
});
