import { useParams } from 'react-router-dom';
import { api } from '../shared/api.ts';
import { Page, useLoad } from './ui.tsx';

/** Login cards: 8 per A4 (2 x 4), print stylesheet in teacher.css. */
export function Cards() {
  const classId = Number(useParams().classId);
  const roster = useLoad(() => api.roster(classId), [classId]);
  const classes = useLoad(() => api.listClasses(), []);
  const cls = classes.data?.find((c) => c.id === classId);
  const students = (roster.data ?? []).filter((s) => s.active);
  const url = window.location.origin;
  return (
    <Page classId={classId} title="Login cards" loading={roster.loading || classes.loading} error={roster.error ?? classes.error} className="t-cards-page">
      <div className="row no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>🖨 Print cards</button>
        <span className="muted">{students.length} cards · 8 per A4 page</span>
      </div>
      <div className="t-cards">
        {students.map((s) => (
          <article className="t-card-login" key={s.id}>
            <div className="t-card-url">{url}</div>
            <div className="t-card-row">
              <span className="t-card-avatar" aria-hidden="true">{s.avatar}</span>
              <div>
                <div className="t-card-name deva">{s.firstName}</div>
                <div className="t-card-small">Class code <b>{cls?.classCode ?? ''}</b></div>
              </div>
            </div>
            <div className="t-card-pinlabel">PIN</div>
            <div className="t-card-pin">{s.pin}</div>
          </article>
        ))}
      </div>
    </Page>
  );
}
