/** /school - first-run checklist, then the school-wide progress dashboard and class leaderboard summary. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { teacherInviteText } from '@shabd/core';
import { api } from '../shared/api.ts';
import { Checklist } from './Checklist.tsx';
import { useLoad } from './hooks.ts';
import { ShareBox } from './ShareBox.tsx';
import { joinedPct, todayIst, topClasses } from './util.ts';

export default function Progress() {
  const [date, setDate] = useState(todayIst());
  const info = useLoad(() => api.school(), []);
  const overview = useLoad(() => api.schoolOverview(date), [date]);
  const [shareOpen, setShareOpen] = useState(false);

  const markShared = async () => {
    if (info.data?.checklist.teacherLinkShared) return;
    try { await api.updateSchool({ teacherLinkShared: true }); info.reload(); } catch { /* the tick is cosmetic */ }
  };
  const err = info.error ?? overview.error;
  const ov = overview.data;
  const si = info.data;
  const invite = si?.teacherInvite ?? null;

  const makeInvite = async () => { await api.createInvite({}); info.reload(); };
  const inviteText = si && invite ? teacherInviteText({ schoolName: si.school.name, url: invite.url, code: invite.code, expiresAt: invite.expiresAt }) : '';

  return (
    <div className="stack">
      {err && <p className="t-error" role="alert">{err}</p>}

      {si && (si.checklist.done
        ? <p className="s-done card">Setup complete ✅</p>
        : (
          <section className="card stack" aria-label="Getting started">
            <h2 className="t-h2">Getting started</h2>
            <Checklist items={[
              {
                done: si.checklist.teacherLinkShared, label: 'Invite your teachers',
                action: invite ? { label: shareOpen ? 'Hide link' : 'Show link', onClick: () => setShareOpen((v) => !v) } : { label: 'Make teacher code', onClick: () => { void makeInvite(); } },
                extra: invite && shareOpen ? <ShareBox url={invite.url} code={invite.code} text={inviteText} onShared={markShared} label="teacher link" /> : null,
              },
              { done: si.checklist.firstTeacherJoined, label: 'First teacher joined' },
              { done: si.checklist.firstClassCreated, label: 'First class created', action: { label: 'Create your own class', to: '/teacher' } },
              { done: si.checklist.firstStudentPlayed, label: 'First student played' },
            ]} />
          </section>
        ))}

      <div className="row s-datebar">
        <label className="t-field">Date
          <input type="date" value={date} max={todayIst()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>

      {ov && (
        <>
          <section className="s-totals" aria-label="Totals">
            {([['Teachers', ov.totals.teachers], ['Classes', ov.totals.classes], ['Students', ov.totals.students],
              ['Joined', ov.totals.joined], ['Played today', ov.totals.completedToday]] as const).map(([k, v]) => (
              <div key={k} className="card s-total"><div className="s-num">{v}</div><div className="muted">{k}</div></div>
            ))}
          </section>

          {ov.classes.length === 0 ? (
            <section className="card stack">
              <p>No classes yet. Your teachers will create them.</p>
              {invite && <a className="btn btn-learn" href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noreferrer" onClick={markShared}>Share teacher link</a>}
            </section>
          ) : (
            <>
              <section className="card stack" aria-label="Class leaderboard">
                <h2 className="t-h2">🏆 Top classes this week</h2>
                <ol className="s-lb">
                  {topClasses(ov.classes).map((c, i) => (
                    <li key={c.name}><span aria-hidden="true">{['🥇', '🥈', '🥉'][i]}</span> <strong>{c.name}</strong> <span className="muted">{c.teacherName}</span> <span className="s-lb-pct">{c.pct}%</span></li>
                  ))}
                </ol>
              </section>
              <div className="t-scroll">
                <table>
                  <thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Joined</th><th>Played today</th><th>This week</th></tr></thead>
                  <tbody>
                    {ov.classes.map((c) => (
                      <tr key={c.classId}>
                        <td><Link to={`/teacher/classes/${c.classId}/dashboard`}><strong>{c.name}</strong></Link></td>
                        <td>{c.teacherName}{!c.teacherActive && <span className="t-badge t-badge-warn">Needs a teacher</span>}</td>
                        <td>{c.studentCount}</td>
                        <td>
                          {c.joinedCount}/{c.studentCount}
                          <div className="s-bar" aria-hidden="true"><div style={{ width: `${joinedPct(c.joinedCount, c.studentCount)}%` }} /></div>
                        </td>
                        <td>{c.completedToday}</td>
                        <td>{c.weekCompletionPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {(overview.loading || info.loading) && !ov && <p className="muted">Loading…</p>}
    </div>
  );
}
