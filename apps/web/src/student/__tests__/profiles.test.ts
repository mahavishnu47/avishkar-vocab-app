import { beforeEach, describe, expect, it, vi } from 'vitest';

const slot: { student: string | null } = { student: null };
vi.mock('../../shared/api.ts', () => ({
  getToken: () => slot.student,
  setToken: (_s: string, t: string | null) => { slot.student = t; },
}));

import type { StudentAuthRes } from '@shabd/core';
import {
  getActiveId, getProfiles, initProfiles, markNeedsPin, MAX_PROFILES, profilesByRecent, removeProfile, saveLogin, setActive, tokenFor, wouldEvict,
} from '../profiles.ts';

const login = (id: number, name = 'Kid' + id): StudentAuthRes => ({
  token: 't' + id, className: '5A', schoolName: 'ZP', classCode: 'K7Q2MX', firstLogin: true,
  student: { id, classId: 1, rollNo: id, firstName: name, avatar: '🦁', active: true },
});

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); slot.student = null; vi.useFakeTimers(); vi.setSystemTime(1000); });

describe('profiles', () => {
  it('saves a login, makes it active and puts its token in the student slot', () => {
    saveLogin(login(1));
    expect(getActiveId()).toBe(1);
    expect(slot.student).toBe('t1');
    expect(getProfiles()[0]).toMatchObject({ studentId: 1, firstName: 'Kid1', classCode: 'K7Q2MX', token: 't1' });
  });

  it('switching writes the other child token', () => {
    saveLogin(login(1)); vi.setSystemTime(2000); saveLogin(login(2));
    expect(slot.student).toBe('t2');
    setActive(1);
    expect(slot.student).toBe('t1');
    expect(getActiveId()).toBe(1);
    expect(profilesByRecent()[0].studentId).toBe(1);
  });

  it('logging in again replaces the same child (no duplicates)', () => {
    saveLogin(login(1)); saveLogin({ ...login(1), token: 'new' });
    expect(getProfiles()).toHaveLength(1);
    expect(tokenFor(1)).toBe('new');
  });

  it('keeps at most 6 and drops the least recently used', () => {
    for (let i = 1; i <= MAX_PROFILES; i++) { vi.setSystemTime(i * 1000); saveLogin(login(i)); }
    expect(wouldEvict(7)?.studentId).toBe(1);
    expect(wouldEvict(3)).toBeNull();
    vi.setSystemTime(9000); setActive(1); // 1 is now the most recent
    expect(wouldEvict(7)?.studentId).toBe(2);
    saveLogin(login(7));
    const ids = getProfiles().map((p) => p.studentId);
    expect(ids).toHaveLength(MAX_PROFILES);
    expect(ids).not.toContain(2);
    expect(ids).toContain(7);
  });

  it('needs-PIN clears the token and the active slot', () => {
    saveLogin(login(1));
    markNeedsPin(1);
    expect(tokenFor(1)).toBeNull();
    expect(slot.student).toBeNull();
    expect(getProfiles()).toHaveLength(1);
  });

  it('remove forgets the profile and its home cache', () => {
    saveLogin(login(1)); localStorage.setItem('shabd.home.1', '{}');
    removeProfile(1);
    expect(getProfiles()).toHaveLength(0);
    expect(localStorage.getItem('shabd.home.1')).toBeNull();
    expect(getActiveId()).toBeNull();
    expect(slot.student).toBeNull();
  });

  it('turns a lone legacy student token into the first profile', () => {
    slot.student = 'old';
    localStorage.setItem('shabd.student', JSON.stringify({ id: 9, firstName: 'Old', avatar: '🐯' }));
    localStorage.setItem('shabd.classCode', 'DEMO5A');
    localStorage.setItem('shabd.home', '{"x":1}');
    initProfiles();
    expect(getProfiles()).toHaveLength(1);
    expect(getProfiles()[0]).toMatchObject({ studentId: 9, token: 'old', classCode: 'DEMO5A' });
    expect(getActiveId()).toBe(9);
    expect(localStorage.getItem('shabd.home.9')).toBe('{"x":1}');
    expect(localStorage.getItem('shabd.student')).toBeNull();
    initProfiles(); // idempotent
    expect(getProfiles()).toHaveLength(1);
  });
});
