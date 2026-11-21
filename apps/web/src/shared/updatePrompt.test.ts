import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchForUpdate } from './updatePrompt.ts';

function fakeServiceWorker(controller: object | null) {
  const listeners: Record<string, () => void> = {};
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller, addEventListener: (t: string, f: () => void) => { listeners[t] = f; } },
  });
  return listeners;
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('watchForUpdate', () => {
  it('shows a refresh banner when a new service worker takes over an already-controlled page', () => {
    const l = fakeServiceWorker({});
    watchForUpdate();
    l.controllerchange!();
    l.controllerchange!(); // only once
    expect(document.querySelectorAll('[data-testid="update-banner"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('A new version is ready.');
  });
  it('stays quiet on the very first visit (no previous controller)', () => {
    const l = fakeServiceWorker(null);
    watchForUpdate();
    l.controllerchange!();
    expect(document.querySelector('[data-testid="update-banner"]')).toBeNull();
  });
  it('does nothing when the browser has no service worker support', () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    expect(() => watchForUpdate()).not.toThrow();
  });
});
