import { useEffect, useMemo, useState } from 'react';
import type { AdminSchoolDetail, AdminSchoolRow } from '@shabd/core';
import { api } from '../shared/api.ts';
import { formatWhen } from '../school/util.ts';
import { Feed, whenFull } from './parts.tsx';

type SortKey = 'newest' | 'name' | 'students' | 'active' | 'activity';

export function StatusChip({ r }: { r: AdminSchoolRow }) {
  return r.school.status === 'active' ? <span className="ad-chip">Active</span> : <span className="ad-chip ad-chip-warn">Suspended</span>;
}

interface Actions { onLink: (r: AdminSchoolRow) => void; onToggle: (r: AdminSchoolRow) => void }

export function SchoolsTab({ rows, onOpen, ...act }: { rows: AdminSchoolRow[] | null; onOpen: (id: number) => void } & Actions) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => !needle || `${r.school.name} ${r.school.district}`.toLowerCase().includes(needle));
    const cmp: Record<SortKey, (a: AdminSchoolRow, b: AdminSchoolRow) => number> = {
      newest: (a, b) => b.school.id - a.school.id,
      name: (a, b) => a.school.name.localeCompare(b.school.name),
      students: (a, b) => b.students - a.students,
      active: (a, b) => b.activeStudents7d - a.activeStudents7d,
      activity: (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
    };
    return [...list].sort(cmp[sort]);
  }, [rows, q, sort]);
  if (!rows) return <p className="muted">Loading schools…</p>;
  return (
    <div className="stack">
      <div className="ad-filters">
        <label className="t-field">Search schools<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or district" /></label>
        <label className="t-field">Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">Newest first</option>
            <option value="name">Name</option>
            <option value="students">Most students</option>
            <option value="active">Most active this week</option>
            <option value="activity">Latest activity</option>
          </select>
        </label>
      </div>
      {rows.length === 0 && <p className="card">No schools yet.</p>}
      {rows.length > 0 && shown.length === 0 && <p className="card">No school matches your search.</p>}
      {shown.length > 0 && (
        <div className="t-scroll">
          <table>
            <caption className="ad-vh">Schools on the platform</caption>
            <thead><tr><th scope="col">School</th><th scope="col">Status</th><th scope="col">Teachers</th><th scope="col">Classes</th><th scope="col">Students</th><th scope="col">Played, 7 days</th><th scope="col">Last activity</th><th scope="col">Teacher login</th><th scope="col">Study</th><th scope="col">Created</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.school.id}>
                  <td><button className="ad-link" onClick={() => onOpen(r.school.id)} aria-label={`Open details for ${r.school.name}`}>{r.school.name}</button><div className="muted">{r.school.district}</div></td>
                  <td><StatusChip r={r} /></td>
                  <td>{r.teachers}</td><td>{r.classes}</td><td>{r.students}</td><td>{r.activeStudents7d}</td>
                  <td>{formatWhen(r.lastActivityAt)}</td><td>{formatWhen(r.lastTeacherLoginAt)}</td>
                  <td>{r.studyRunning ? <span className="ad-chip ad-chip-info">Running</span> : 'None'}</td>
                  <td>{formatWhen(r.createdAt)}</td>
                  <td>
                    <div className="s-rowactions">
                      <button className="btn" onClick={() => act.onLink(r)}>New setup link</button>
                      <button className="btn" onClick={() => act.onToggle(r)}>{r.school.status === 'active' ? 'Suspend' : 'Resume'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SchoolDetail({ id, row, version, onBack, onError, onLink, onToggle }: {
  id: number; row: AdminSchoolRow | undefined; version: number; onBack: () => void; onError: (e: unknown) => void;
} & Actions) {
  const [d, setD] = useState<AdminSchoolDetail | null>(null);
  useEffect(() => {
    let live = true;
    api.admin.schoolDetail(id).then((x) => { if (live) setD(x); }, (e) => { if (live) onError(e); });
    return () => { live = false; };
  }, [id, version, onError]);
  const r = row ?? d?.row;
  return (
    <div className="stack">
      <div><button className="btn" onClick={onBack}>All schools</button></div>
      {!d || !r ? <p className="muted">Loading school…</p> : (
        <>
          <section className="card stack" aria-label="School">
            <h2 className="t-h2">{r.school.name} <StatusChip r={r} /></h2>
            <p className="muted">{r.school.district || 'No district'} · Student code {r.school.studentCode} · {r.students} students · {r.activeStudents7d} played in the last 7 days · Last activity {whenFull(r.lastActivityAt)}{r.studyRunning ? ' · Research study running' : ''}</p>
            <div className="row">
              <button className="btn" onClick={() => onLink(r)}>New setup link</button>
              <button className="btn" onClick={() => onToggle(r)}>{r.school.status === 'active' ? 'Suspend' : 'Resume'}</button>
            </div>
          </section>
          <section className="stack" aria-label="Teachers">
            <h3 className="t-h2">Teachers</h3>
            {d.teachers.length === 0 ? <p className="muted">No teachers yet.</p> : (
              <div className="t-scroll"><table>
                <caption className="ad-vh">Teachers in this school</caption>
                <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Last login</th></tr></thead>
                <tbody>{d.teachers.map((t) => (
                  <tr key={t.id}><td>{t.name}</td><td>{t.email}</td><td>{t.role === 'school_admin' ? 'School admin' : 'Teacher'}</td><td>{t.active ? 'Active' : 'Turned off'}</td><td>{whenFull(t.lastLoginAt)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          <section className="stack" aria-label="Classes">
            <h3 className="t-h2">Classes</h3>
            {d.classes.length === 0 ? <p className="muted">No classes yet.</p> : (
              <div className="t-scroll"><table>
                <caption className="ad-vh">Classes in this school</caption>
                <thead><tr><th scope="col">Class</th><th scope="col">Code</th><th scope="col">Students</th><th scope="col">Played, 7 days</th><th scope="col">Status</th></tr></thead>
                <tbody>{d.classes.map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td>{c.classCode}</td><td>{c.students}</td><td>{c.active7d}</td><td>{c.archived ? 'Archived' : 'Open'}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          <section className="stack" aria-label="Recent activity in this school">
            <h3 className="t-h2">Recent activity</h3>
            <Feed items={d.recentActivity} showSchool={false} />
          </section>
        </>
      )}
    </div>
  );
}
