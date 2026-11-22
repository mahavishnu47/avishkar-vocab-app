/** /school/settings - school details, student link + QR + poster, recent activity. */
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../shared/api.ts';
import { QrSvg } from '../shared/qr.tsx';
import { useLoad } from './hooks.ts';
import { ShareBox } from './ShareBox.tsx';
import { describeAudit, errMsg, formatWhen } from './util.ts';

export default function Settings() {
  const info = useLoad(() => api.school(), []);
  const audit = useLoad(() => api.schoolAudit({ limit: 50 }), []);
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  useEffect(() => { if (info.data) { setName(info.data.school.name); setDistrict(info.data.school.district); } }, [info.data]);

  const save = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setMsg(null);
    try { info.setData(await api.updateSchool({ name: name.trim(), district: district.trim() })); setMsg('Saved ✅'); } catch (err) { setError(errMsg(err)); }
  };
  const rotate = async () => {
    setError(null); setConfirmRotate(false);
    try { info.setData(await api.rotateStudentCode()); setMsg('New student link ready ✅'); audit.reload(); } catch (err) { setError(errMsg(err)); }
  };

  const si = info.data;
  const url = si?.studentJoinUrl ?? '';
  const text = si ? `WordWise 🦜: 5 new English words every day at ${si.school.name}. Open ${url} and tap your class and name.` : '';
  return (
    <div className="stack">
      {(error ?? info.error) && <p className="t-error" role="alert">{error ?? info.error}</p>}
      {msg && <p className="feedback-ok" role="status">{msg}</p>}

      <form className="card stack no-print" onSubmit={save}>
        <h2 className="t-h2">School</h2>
        <label className="t-field">School name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
        <label className="t-field">District<input value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={60} /></label>
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Save</button>
      </form>

      {si && (
        <section className="card stack no-print" aria-label="Student link">
          <h2 className="t-h2">Student link</h2>
          <p className="muted">Students open this link, pick their class and name, and type their PIN.</p>
          <ShareBox url={url} code={si.school.studentCode} text={text} label="student link" />
          <div className="row">
            <button className="btn" onClick={() => window.print()}>Print poster</button>
            {confirmRotate
              ? <><button className="btn" onClick={rotate}>Yes, make a new link</button><button className="btn" onClick={() => setConfirmRotate(false)}>Cancel</button></>
              : <button className="btn" onClick={() => setConfirmRotate(true)}>New link</button>}
          </div>
          {confirmRotate && <p className="t-warn">The old link will stop working.</p>}
        </section>
      )}

      {si && (
        <section className="s-poster" aria-hidden="true">
          <h1>🦜 WordWise</h1>
          <h2>Scan to play WordWise</h2>
          <QrSvg text={url} size={360} label="Student link QR code" />
          <p className="s-poster-link">{url}</p>
          <p>{si.school.name}</p>
        </section>
      )}

      <section className="card stack no-print" aria-label="Recent activity">
        <h2 className="t-h2">Recent activity</h2>
        {(audit.data ?? []).length === 0 && !audit.loading && <p className="muted">Nothing yet.</p>}
        <ul className="s-audit">
          {(audit.data ?? []).map((a) => <li key={a.id}><span className="muted">{formatWhen(a.at)}</span> {describeAudit(a)}</li>)}
        </ul>
      </section>
    </div>
  );
}
