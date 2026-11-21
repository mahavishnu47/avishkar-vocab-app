/**
 * Vitest setup: make sure `localStorage` / `sessionStorage` are real, working storages (B-18).
 * Newer Node versions ship an experimental global `localStorage` that is unusable without --localstorage-file and
 * shadows jsdom's, so every test touching storage crashed with "Cannot read properties of undefined (reading 'clear')".
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(String(key)) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(String(key)); }
  setItem(key: string, value: string): void { this.map.set(String(key), String(value)); }
  [name: string]: unknown;
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  let usable = false;
  try { usable = typeof (globalThis as Record<string, unknown>)[name] === 'object' && typeof (globalThis[name] as Storage).clear === 'function'; } catch { usable = false; }
  if (!usable) {
    const store = new MemoryStorage();
    Object.defineProperty(globalThis, name, { value: store, configurable: true, writable: true });
    if (typeof window !== 'undefined') Object.defineProperty(window, name, { value: store, configurable: true, writable: true });
  }
}
