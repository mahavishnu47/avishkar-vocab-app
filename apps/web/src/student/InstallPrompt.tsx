import { useEffect, useState } from 'react';

/** Add-to-home-screen card (docs/ONBOARDING_SPEC.md 2.4). The event is captured as soon as this module loads. */
interface BIP extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: BIP | null = null;
const subs = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; subs.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
}

export const DISMISS_AT = 'shabd.installDismissedAt';
export const DISMISS_N = 'shabd.installDismissCount';
const WEEK = 7 * 24 * 3600 * 1000;

export function shouldShowInstall(o: { dismissedAt: number; dismissals: number; now: number; standalone: boolean }): boolean {
  if (o.standalone) return false;
  if (o.dismissals >= 3) return false;
  if (o.dismissedAt && o.now - o.dismissedAt < WEEK) return false;
  return true;
}

function rd(k: string): number { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } }
function isStandalone(): boolean {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true; } catch { return false; }
}

export function InstallPrompt() {
  const [, tick] = useState(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  if (hidden || !shouldShowInstall({ dismissedAt: rd(DISMISS_AT), dismissals: rd(DISMISS_N), now: Date.now(), standalone: isStandalone() })) return null;

  const notNow = () => {
    try { localStorage.setItem(DISMISS_AT, String(Date.now())); localStorage.setItem(DISMISS_N, String(rd(DISMISS_N) + 1)); } catch { /* ignore */ }
    setHidden(true);
  };
  const add = async () => {
    if (!deferred) return;
    const d = deferred; deferred = null;
    try { await d.prompt(); await d.userChoice; } catch { /* ignore */ }
    setHidden(true);
  };
  return (
    <section className="card stack install-card" aria-label="Install">
      <div className="title" style={{ fontSize: 20 }}>📲 Put Shabd Mitra on your home screen</div>
      {deferred
        ? <button className="btn btn-primary btn-block" onClick={() => void add()}>Add</button>
        : <p className="muted" style={{ margin: 0 }}>Open in Chrome, tap ⋮, then "Add to Home screen"</p>}
      <button className="link" style={{ alignSelf: 'center' }} onClick={notNow}>Not now</button>
    </section>
  );
}

/** test helper */
export function _setDeferredForTests(e: BIP | null): void { deferred = e; }
