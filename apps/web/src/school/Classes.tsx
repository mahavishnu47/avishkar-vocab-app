/** /school/classes - all classes, change teacher, archive. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { teacherInviteText } from '@shabd/core';
import { api } from '../shared/api.ts';
import { useLoad } from './hooks.ts';
import { errMsg, whatsappUrl } from './util.ts';

export default function Classes() {
  const classes = useLoad(() => api.schoolClasses(), []);
  const teachers = useLoad(() => api.schoolTeachers(), []);
  const info = useLoad(() => api.school(), []);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); classes.reload(); } catch (e) { setError(errMsg(e)); }
  };
  const active = (teachers.data ?? []).filter((t) => t.active);
  const rows = classes.data ?? [];
  const inv = info.data?.teacherInvite;
  const shareHref = inv && info.data ? whatsappUrl(teacherInviteText({ schoolName: info.data.school.name, url: inv.url, code: inv.code, expiresAt: inv.expiresAt })) : null;

  return (
    <div className="stack">
      {(error ?? classes.error) && <p className="t-error" role="alert">{error ?? classes.error}</p>}
      {rows.length === 0 && !classes.loading ? (
        <section className="card stack">
          <p>No classes yet. Your teachers will create them.</p>
          {shareHref && <a className="btn btn-learn" href={shareHref} target="_blank" rel="noreferrer">Share teacher link</a>}
        </section>
      ) : (
        <div className="t-scroll">
          <table>
            <thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Joined</th><th>Join</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/teacher/classes/${c.id}/dashboard`}><strong>{c.name}</strong></Link></td>
                  <td>
                    <select aria-label={`Teacher for ${c.name}`} value={c.teacherId} onChange={(e) => act(() => api.updateSchoolClass(c.id, { teacherId: Number(e.target.value) }))}>
                      {!active.some((t) => t.id === c.teacherId) && <option value={c.teacherId}>{c.teacherName} (off)</option>}
                      {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {!active.some((t) => t.id === c.teacherId) && teachers.data && <span className="t-badge t-badge-warn">Needs a teacher</span>}
                  </td>
                  <td>{c.studentCount}</td>
                  <td>{c.joinedCount}/{c.studentCount}</td>
                  <td>{c.joinEnabled ? 'On' : 'Off'}</td>
                  <td><button className="btn" onClick={() => act(() => api.updateSchoolClass(c.id, { archived: true }))}>Archive</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
