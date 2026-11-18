/**
 * Persisted in-stage state of the daily session, so closing the app resumes at the exact stage.
 * OWNER: Lane C (student UI). Key: 'shabd.session.<sessionId>'. Generic on purpose: the play screen
 * owns the shape of the state; this module only does safe JSON persistence + housekeeping.
 */
const PREFIX = 'shabd.session.';
const TODAY_KEY = 'shabd.today'; // last TodaySessionRes (+ studentId) so /play can resume offline

export function loadSession<T>(sessionId: number): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + sessionId);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function saveSession<T>(sessionId: number, state: T): void {
  try { localStorage.setItem(PREFIX + sessionId, JSON.stringify(state)); } catch { /* ignore */ }
}

export function clearSession(sessionId: number): void {
  try { localStorage.removeItem(PREFIX + sessionId); } catch { /* ignore */ }
}

/** Remove stored sessions other than `keepIds` (called when a new day's session starts). */
export function pruneSessions(keepIds: number[]): void {
  try {
    const keep = new Set(keepIds.map((i) => PREFIX + i));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !keep.has(k)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

export function saveToday<T>(studentId: number, res: T): void {
  try { localStorage.setItem(TODAY_KEY, JSON.stringify({ studentId, res })); } catch { /* ignore */ }
}

export function loadToday<T>(studentId: number): T | null {
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { studentId: number; res: T };
    return j.studentId === studentId ? j.res : null;
  } catch { return null; }
}
