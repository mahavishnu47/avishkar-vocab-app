/** /school/teachers - teacher list, invite card, reset-password links. */
import { useState } from 'react';
import { teacherInviteText, type InviteWithText, type SchoolTeacherRow, type UpdateSchoolTeacherReq } from '@shabd/core';
import { api } from '../shared/api.ts';
import { useSchoolCtx } from './ctx.ts';
import { useLoad } from './hooks.ts';
import { ShareBox } from './ShareBox.tsx';
import { errMsg, formatWhen } from './util.ts';

export default function Teachers() {
  const { me, schoolName } = useSchoolCtx();
  const list = useLoad(() => api.schoolTeachers(), []);
  const info = useLoad(() => api.school(), []);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState<{ teacher: SchoolTeacherRow; link: InviteWithText } | null>(null);

  const patch = async (t: SchoolTeacherRow, b: UpdateSchoolTeacherReq) => {
    setError(null);
    try { await api.updateSchoolTeacher(t.id, b); list.reload(); } catch (e) { setError(errMsg(e)); }
  };
  const makeReset = async (t: SchoolTeacherRow) => {
    setError(null);
    try { setReset({ teacher: t, link: await api.teacherResetLink(t.id) }); } catch (e) { setError(errMsg(e)); }
  };
  const newCode = async () => { setError(null); try { await api.createInvite({}); info.reload(); } catch (e) { setError(errMsg(e)); } };
  const turnOffCode = async () => {
    const inv = info.data?.teacherInvite; if (!inv) return;
    setError(null);
    try { await api.revokeInvite(inv.id); info.reload(); } catch (e) { setError(errMsg(e)); }
  };

  const invite = info.data?.teacherInvite ?? null;
  const rows = list.data ?? [];
  return (
    <div className="stack">
      {(error ?? list.error ?? info.error) && <p className="t-error" role="alert">{error ?? list.error ?? info.error}</p>}

      <section className="card stack" aria-label="Teacher invite">
        <h2 className="t-h2">Teacher invite</h2>
        {invite ? (
          <>
            <p className="muted">Used {invite.useCount} time{invite.useCount === 1 ? '' : 's'}. Works until {formatWhen(invite.expiresAt)}.</p>
            <ShareBox url={invite.url} code={invite.code} qr={false} label="teacher link"
              text={teacherInviteText({ schoolName, url: invite.url, code: invite.code, expiresAt: invite.expiresAt })}
              onShared={() => { void api.updateSchool({ teacherLinkShared: true }).catch(() => undefined); }} />
            <div className="row">
              <button className="btn" onClick={newCode}>New code</button>
              <button className="btn" onClick={turnOffCode}>Turn off code</button>
            </div>
          </>
        ) : (
          <>
            <p>Invite your teachers to get started.</p>
            <button className="btn btn-primary" onClick={newCode}>Make teacher code</button>
          </>
        )}
      </section>

      {reset && (
        <section className="card stack" aria-label="Password link">
          <h2 className="t-h2">Password link for {reset.teacher.name}</h2>
          <p className="muted">Works once and ends in 24 hours.</p>
          <ShareBox url={reset.link.url} text={reset.link.whatsappText} qr={false} label="password link" />
          <button className="btn" onClick={() => setReset(null)}>Done</button>
        </section>
      )}

      {rows.length === 0 && !list.loading ? (
        <p className="card">Invite your teachers to get started.</p>
      ) : (
        <div className="t-scroll">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Classes</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={t.active ? '' : 's-off'}>
                  <td><strong>{t.name}</strong><div className="muted">{t.email}</div></td>
                  <td>{t.role === 'school_admin' ? 'Admin' : 'Teacher'}{!t.active && <span className="t-badge t-badge-warn">Off</span>}</td>
                  <td>{t.classCount}</td>
                  <td>{formatWhen(t.lastLoginAt)}</td>
                  <td>
                    <div className="s-rowactions">
                      <button className="btn" onClick={() => patch(t, { role: t.role === 'school_admin' ? 'teacher' : 'school_admin' })}>
                        {t.role === 'school_admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                      {t.id !== me.id && <button className="btn" onClick={() => makeReset(t)}>Reset password</button>}
                      <button className="btn" onClick={() => patch(t, { active: !t.active })}>{t.active ? 'Turn off' : 'Turn on'}</button>
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
