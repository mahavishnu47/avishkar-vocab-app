import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStudentDevice, markStudentDevice, requestPersistentStorage } from '../../shared/persist.ts';

afterEach(() => {
  document.cookie = 'shabd_student_device=; max-age=0; path=/';
  vi.restoreAllMocks();
});

describe('keeping a child signed in (P-1)', () => {
  it('remembers that a child uses this phone, separately from localStorage', () => {
    expect(isStudentDevice()).toBe(false);
    markStudentDevice();
    localStorage.clear(); // storage lost...
    expect(isStudentDevice()).toBe(true); // ...but the phone still knows a child plays here
  });

  it('asks the browser to keep storage permanently, once', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    Object.defineProperty(navigator, 'storage', { value: { persist, persisted }, configurable: true });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    persisted.mockResolvedValue(true);
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1); // already persistent: no second prompt
  });

  it('never throws on browsers without the storage API', async () => {
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
    expect(await requestPersistentStorage()).toBe(false);
  });
});
