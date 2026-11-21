import type { AdminActivityEntry, AdminOverview } from '@shabd/core';
import { DailyChart, Feed, whenFull } from './parts.tsx';

function Kpi({ label, value }: { label: string; value: number }) {
  return <div className="ad-kpi"><b>{value.toLocaleString('en-IN')}</b><span>{label}</span></div>;
}

export function OverviewTab({ data, activity }: { data: AdminOverview | null; activity: AdminActivityEntry[] | null }) {
  if (!data) return <p className="muted">Loading overview…</p>;
  const { totals: t, activity: a, health: h } = data;
  const empty = t.schoolsActive + t.schoolsSuspended === 0;
  return (
    <div className="stack">
      {empty && <p className="card">No schools yet. Add the first school with the New school button.</p>}
      <section className="stack" aria-label="Platform totals">
        <h2 className="t-h2">Platform</h2>
        <div className="ad-kpis">
          <Kpi label="Active schools" value={t.schoolsActive} />
          <Kpi label="Suspended schools" value={t.schoolsSuspended} />
          <Kpi label="Teachers" value={t.teachers} />
          <Kpi label="Classes" value={t.classes} />
          <Kpi label="Students" value={t.students} />
          <Kpi label="Join requests waiting" value={t.joinRequestsPending} />
          <Kpi label="Research studies running" value={t.studiesRunning} />
        </div>
      </section>
      <section className="stack" aria-label="Student activity">
        <h2 className="t-h2">Activity</h2>
        <div className="ad-kpis">
          <Kpi label="Students played today" value={a.studentsToday} />
          <Kpi label="Students played, 7 days" value={a.students7d} />
          <Kpi label="Students played, 30 days" value={a.students30d} />
          <Kpi label="Sessions finished today" value={a.sessionsCompletedToday} />
          <Kpi label="Sessions finished, 7 days" value={a.sessionsCompleted7d} />
          <Kpi label="Words completed, 7 days" value={a.wordsCompleted7d} />
        </div>
        <div className="card stack">
          <h3 className="t-h2">Last 30 days</h3>
          <DailyChart daily={data.daily} />
        </div>
      </section>
      <section className="stack" aria-label="System health">
        <h2 className="t-h2">System health</h2>
        <div className="ad-health">
          <span>Database: {h.db === 'ok' ? 'OK' : 'Down'}</span>
          <span>Migrations applied: {h.migrationsApplied} (latest {h.latestMigration ?? 'none'})</span>
          <span>Words loaded: {h.wordsLoaded}</span>
          <span>Version {h.appVersion}</span>
          <span>Server time {whenFull(h.serverTime)}</span>
        </div>
      </section>
      <div className="ad-two">
        <section className="card stack" aria-label="Top schools">
          <h2 className="t-h2">Most active schools (7 days)</h2>
          {data.topSchools.length === 0 ? <p className="muted">No student activity in the last 7 days.</p> : (
            <ol>{data.topSchools.map((s) => <li key={s.schoolId}><strong>{s.name}</strong>: {s.activeStudents7d} of {s.students} students</li>)}</ol>
          )}
        </section>
        <section className="card stack" aria-label="Recent activity">
          <h2 className="t-h2">Recent activity</h2>
          {activity ? <Feed items={activity.slice(0, 8)} /> : <p className="muted">Loading…</p>}
        </section>
      </div>
    </div>
  );
}
