import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QrSvg } from '../shared/qr.tsx';
import { api } from '../shared/api.ts';
import { ShareBox } from './ShareBox.tsx';
import { errMsg, Page, useLoad } from './ui.tsx';
import { shortLink } from './util.ts';

/** Class join link: QR + WhatsApp + Copy + Print cards + projector view. */
export function Share() {
  const classId = Number(useParams().classId);
  const share = useLoad(() => api.classShare(classId), [classId]);
  const classes = useLoad(() => api.listClasses(), []);
  const cls = classes.data?.find((c) => c.id === classId);
  const [full, setFull] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const markShared = useCallback(() => { api.updateClass(classId, { linkShared: true }).catch(() => { /* not critical */ }); }, [classId]);

  const toggleJoin = async () => {
    if (!cls) return;
    setErr(null);
    try { await api.updateClass(classId, { joinEnabled: !cls.joinEnabled }); classes.reload(); } catch (e) { setErr(errMsg(e)); }
  };
  const rotate = async () => {
    if (!window.confirm('Old link and printed cards stop working for new phones. Children already playing are not affected. Make a new link?')) return;
    setErr(null);
    try { await api.rotateClassCode(classId); setMsg('New link ready. Share it again.'); share.reload(); classes.reload(); } catch (e) { setErr(errMsg(e)); }
  };

  const s = share.data;
  return (
    <Page classId={classId} title="Share" loading={share.loading || classes.loading} error={share.error ?? classes.error}>
      {s && (
        <>
          <p>Parents open this link on the child's phone and tap the child's name. Print the login cards so each child has a PIN.</p>
          <ShareBox url={s.joinUrl} text={s.whatsappText} code={s.classCode} qrLabel={`QR code to join class ${cls?.name ?? ''}`} onShared={markShared}>
            <Link className="btn" to={`/teacher/classes/${classId}/cards`} onClick={markShared}>Print login cards</Link>
            <button className="btn" onClick={() => setFull(true)}>Show on screen</button>
          </ShareBox>
          {msg && <div className="t-ok" role="status">{msg}</div>}
          {err && <div className="t-error" role="alert">{err}</div>}
          {cls && (
            <section className="card stack">
              <label className="row">
                <input type="checkbox" checked={cls.joinEnabled} onChange={toggleJoin} />
                <span>Students can join with this link</span>
              </label>
              <button className="btn" onClick={rotate}>Make a new link</button>
            </section>
          )}
        </>
      )}
      {full && s && (
        <div className="t-fullqr" role="dialog" aria-label="Join QR code">
          <QrSvg text={s.joinUrl} size={Math.min(window.innerWidth, window.innerHeight) * 0.7} label={`QR code to join class ${cls?.name ?? ''}`} />
          <div className="t-sharelink">{shortLink(s.joinUrl)}</div>
          <button className="btn btn-primary" onClick={() => setFull(false)}>Close</button>
        </div>
      )}
    </Page>
  );
}
