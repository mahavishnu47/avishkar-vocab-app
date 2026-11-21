import { useMemo, useState } from 'react';
import type { AdminActivityEntry } from '@shabd/core';
import { Feed, actionLabel } from './parts.tsx';

export function ActivityTab({ items }: { items: AdminActivityEntry[] | null }) {
  const [text, setText] = useState('');
  const [school, setSchool] = useState('');
  const schools = useMemo(() => [...new Set((items ?? []).map((e) => e.schoolName).filter((x): x is string => !!x))].sort(), [items]);
  if (!items) return <p className="muted">Loading activity…</p>;
  const q = text.trim().toLowerCase();
  const shown = items.filter((e) => (!school || e.schoolName === school) && (!q || e.action.toLowerCase().includes(q) || actionLabel(e.action).toLowerCase().includes(q)));
  return (
    <div className="stack">
      <div className="ad-filters">
        <label className="t-field">Filter by action<input value={text} onChange={(e) => setText(e.target.value)} placeholder="for example login or class" /></label>
        <label className="t-field">School
          <select value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">All schools</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <p className="muted" aria-live="polite">{shown.length} of {items.length} recent events</p>
      <Feed items={shown} />
    </div>
  );
}
