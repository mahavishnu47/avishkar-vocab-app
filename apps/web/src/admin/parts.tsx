/** Small shared pieces of the super admin dashboard. */
import type { AdminActivityEntry, AdminDailyPoint } from '@shabd/core';

/** "12 Nov, 14:05" in IST. */
export function whenFull(iso: string | null): string {
  if (!iso) return 'Never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t + 5.5 * 3_600_000);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${m}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const WHO: Record<AdminActivityEntry['actorType'], string> = { super: 'Platform admin', teacher: 'Teacher', student: 'Student', system: 'System' };

/** "school.create" -> "School create". */
export const actionLabel = (a: string): string => { const s = a.replace(/[._]/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

export function Feed({ items, showSchool = true }: { items: AdminActivityEntry[]; showSchool?: boolean }) {
  if (items.length === 0) return <p className="muted">No activity yet.</p>;
  return (
    <ul className="ad-feed">
      {items.map((e) => (
        <li key={e.id}>
          <strong>{actionLabel(e.action)}</strong> <span className="muted">by {WHO[e.actorType]}</span>
          {showSchool && e.schoolName && <> in {e.schoolName}</>}
          <div className="muted">{whenFull(e.at)}</div>
        </li>
      ))}
    </ul>
  );
}

/** 30-day chart: bars = students who played, line = sessions finished. Inline SVG, no library. */
export function DailyChart({ daily }: { daily: AdminDailyPoint[] }) {
  const W = 600, H = 180, L = 30, B = 22, T = 8;
  const max = Math.max(1, ...daily.map((d) => Math.max(d.activeStudents, d.sessionsCompleted)));
  const bw = (W - L) / Math.max(1, daily.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = daily.map((d, i) => `${(L + bw * i + bw / 2).toFixed(1)},${y(d.sessionsCompleted).toFixed(1)}`).join(' ');
  const total = daily.reduce((a, d) => a + d.activeStudents, 0);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="ad-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Students who played each day over the last ${daily.length} days. Total student-days: ${total}.`}>
        <line x1={L} y1={y(0)} x2={W} y2={y(0)} stroke="currentColor" opacity="0.3" />
        <text x={L - 4} y={y(max) + 4} textAnchor="end">{max}</text>
        <text x={L - 4} y={y(0)} textAnchor="end">0</text>
        {daily.map((d, i) => (
          <rect key={d.date} className="bar" x={L + bw * i + 1} y={y(d.activeStudents)} width={Math.max(1, bw - 2)} height={y(0) - y(d.activeStudents)}>
            <title>{`${d.date}: ${d.activeStudents} played, ${d.sessionsCompleted} finished`}</title>
          </rect>
        ))}
        <polyline className="line" points={line} />
        {daily.length > 0 && <text x={L} y={H - 4}>{daily[0]!.date.slice(5)}</text>}
        {daily.length > 0 && <text x={W} y={H - 4} textAnchor="end">{daily[daily.length - 1]!.date.slice(5)}</text>}
      </svg>
      <figcaption className="ad-legend"><span>Bars: students who played</span><span>Line: sessions finished</span></figcaption>
    </figure>
  );
}
