/**
 * Keeping a child signed in across "swipe away from recent apps" (P-1).
 * 1. Ask the browser to keep this site's storage permanently (it may otherwise clear it when the phone is low on space).
 * 2. Leave a small "a child uses this phone" cookie. Cookies and localStorage are cleared separately, so if the saved
 *    profiles vanish we can still greet the child with "Welcome back" instead of the three-role chooser meant for strangers.
 */
const COOKIE = 'shabd_student_device';

/** Ask the browser not to evict our storage. Safe to call often; never throws. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

export function markStudentDevice(): void {
  try { document.cookie = `${COOKIE}=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`; } catch { /* cookies blocked */ }
}

export function isStudentDevice(): boolean {
  try { return document.cookie.split('; ').some((c) => c === `${COOKIE}=1`); } catch { return false; }
}
