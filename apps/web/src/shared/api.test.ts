import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

describe('token slots', () => {
  it('migrates the legacy token to the student slot when shabd.student exists', async () => {
    localStorage.setItem('shabd.token', 'old'); localStorage.setItem('shabd.student', '{}');
    const m = await import('./api.ts');
    expect(m.getToken('student')).toBe('old');
    expect(m.getToken('staff')).toBeNull();
    expect(localStorage.getItem('shabd.token')).toBeNull();
  });
  it('migrates the legacy token to the staff slot otherwise', async () => {
    localStorage.setItem('shabd.token', 'old');
    const m = await import('./api.ts');
    expect(m.getToken('staff')).toBe('old');
    expect(m.getToken('student')).toBeNull();
  });
  it('keeps scopes separate and withToken uses the explicit token', async () => {
    const m = await import('./api.ts');
    m.setToken('student', 'S'); m.setToken('staff', 'T');
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>).Authorization ?? '');
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    await m.api.studentHome();
    await m.api.school();
    await m.api.withToken('X').studentHome();
    await m.api.joinClass('ABC');
    expect(seen).toEqual(['Bearer S', 'Bearer T', 'Bearer X', '']);
    vi.unstubAllGlobals();
  });
});
