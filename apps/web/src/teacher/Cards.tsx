import { useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { QrSvg } from '../shared/qr.tsx';
import { api } from '../shared/api.ts';
import { Page, useLoad } from './ui.tsx';
import { shortLink } from './util.ts';

/** Login cards: 8 per A4 (2 x 4). Each has avatar, name, roll, PIN, the class QR and the short link. */
export function Cards() {
  const classId = Number(useParams().classId);
  const roster = useLoad(() => api.roster(classId), [classId]);
  const classes = useLoad(() => api.listClasses(), []);
  const share = useLoad(() => api.classShare(classId), [classId]);
  const cls = classes.data?.find((c) => c.id === classId);
  const students = (roster.data ?? []).filter((s) => s.active);
  const url = share.data?.joinUrl ?? '';
  const fired = useRef(false);
  const print = useCallback(() => {
    if (!fired.current) { fired.current = true; api.updateClass(classId, { linkShared: true }).catch(() => { /* not critical */ }); }
    window.print();
  }, [classId]);
  return (
    <Page classId={classId} title="Login cards" loading={roster.loading || classes.loading || share.loading}
      error={roster.error ?? classes.error ?? share.error} className="t-cards-page">
      <div className="row no-print">
        <button className="btn btn-primary" onClick={print}>🖨 Print cards</button>
        <span className="muted">{students.length} cards · 8 per A4 page</span>
      </div>
      {students.length === 0 && <p className="muted no-print">No students yet. Add students to print their cards.</p>}
      <div className="t-cards">
        {students.map((s) => (
          <article className="t-card-login" key={s.id}>
            <div className="t-card-main">
              <div>
                <div className="t-card-row">
                  <span className="t-card-avatar" aria-hidden="true">{s.avatar}</span>
                  <div>
                    <div className="t-card-name deva">{s.firstName}</div>
                    <div className="t-card-small">Roll {s.rollNo}{cls ? ` · Class ${cls.name}` : ''}</div>
                  </div>
                </div>
                <div className="t-card-pinlabel">PIN</div>
                <div className="t-card-pin">{s.pin}</div>
              </div>
              {url && <div className="t-card-qr"><QrSvg text={url} size={96} label={`QR code to join class ${cls?.name ?? ''}`} /></div>}
            </div>
            {url && <div className="t-card-link">{shortLink(url)}</div>}
            <div className="t-card-foot">Ask a grown-up to open this link. Keep this card safe. It is your key.</div>
          </article>
        ))}
      </div>
    </Page>
  );
}
