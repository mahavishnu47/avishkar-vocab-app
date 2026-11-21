/**
 * After a deploy the new service worker takes control (skipWaiting + clientsClaim) but the page that is already open keeps
 * running the OLD code until the next visit. Reloading by itself could wipe a child's half-typed sentence, so we show a small
 * banner and let them tap "Refresh" when it suits them. Plain DOM so it works even if React is busy or crashed.
 */
export function watchForUpdate(): void {
  try {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const hadController = !!sw.controller; // false on the very first visit: nothing is "updated" then
    let shown = false;
    sw.addEventListener('controllerchange', () => {
      if (!hadController || shown) return;
      shown = true;
      showBanner();
    });
  } catch { /* old browser: no banner, the next visit picks up the update */ }
}

function showBanner(): void {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.setAttribute('data-testid', 'update-banner');
  bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:space-between;'
    + 'background:#1f2937;color:#fff;padding:12px 16px;border-radius:14px;font:600 16px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
  const msg = document.createElement('span');
  msg.textContent = 'A new version is ready.';
  const btn = document.createElement('button');
  btn.textContent = 'Refresh';
  btn.style.cssText = 'min-height:44px;padding:0 18px;border:0;border-radius:10px;background:#fff;color:#1f2937;font:700 16px system-ui,sans-serif;cursor:pointer';
  btn.addEventListener('click', () => location.reload());
  bar.append(msg, btn);
  document.body.appendChild(bar);
}
