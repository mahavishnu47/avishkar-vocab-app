import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../shared/api.ts';
import { errMsg, Page, useLoad } from './ui.tsx';
import { parseRosterText } from './util.ts';

/** Paste a class list or upload a CSV; live preview with simple errors; consent checkbox; one save. */
export function AddStudents() {
  const classId = Number(useParams().classId);
  const navigate = useNavigate();
  const roster = useLoad(() => api.roster(classId), [classId]);
  const classes = useLoad(() => api.listClasses(), []);
  const cls = classes.data?.find((c) => c.id === classId);
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentTouched, setConsentTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // a class that already has consent on record starts ticked
  useEffect(() => { if (cls?.consentAttestedAt && !consentTouched) setConsent(true); }, [cls, consentTouched]);

  const parsed = parseRosterText(text, (roster.data ?? []).map((s) => s.rollNo));
  const canSave = parsed.rows.length > 0 && parsed.errors.length === 0 && consent && !busy;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result ?? '')); setFormError(null); };
    reader.onerror = () => setFormError('We could not read that file. Try pasting the names instead.');
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!canSave) return;
    setFormError(null); setBusy(true);
    try {
      await api.addStudents(classId, { students: parsed.rows, consentConfirmed: true });
      navigate(`/teacher/classes/${classId}/share`);
    } catch (e) { setFormError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Page classId={classId} title="Add students" loading={roster.loading || classes.loading} error={roster.error ?? classes.error}>
      <section className="card stack">
        <label className="t-field">Paste your class list (from WhatsApp, Excel or Google Sheets)
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'1, Riya\n2, Arjun\n3, सानिका\n\nOr just names, one per line.'} />
        </label>
        <div className="row">
          <label className="btn" htmlFor="csv-file">Or upload a CSV file</label>
          <input id="csv-file" ref={fileRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          {text && <button type="button" className="btn t-link" onClick={() => setText('')}>Clear</button>}
        </div>
        <p className="muted t-hint">One student per line: roll number and name. Names only also works. We keep first names only.</p>
        {parsed.errors.map((er) => <div key={er} className="t-error" role="alert">{er}</div>)}
        {parsed.notices.map((n) => <div key={n} className="t-warn" role="status">{n}</div>)}
        {parsed.rows.length > 0 && (
          <div className="t-scroll">
            <table aria-label="Preview">
              <thead><tr><th>Roll</th><th>Name</th></tr></thead>
              <tbody>{parsed.rows.map((r) => <tr key={r.rollNo}><td>{r.rollNo}</td><td className="deva">{r.firstName}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <label className="row">
          <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setConsentTouched(true); }} />
          <span>Parents have given consent (school consent form).</span>
        </label>
        {formError && <div className="t-error" role="alert">{formError}</div>}
        <button className="btn btn-primary btn-block" disabled={!canSave} onClick={save}>
          {busy ? 'Saving…' : parsed.rows.length === 0 ? 'Save students' : `Save ${parsed.rows.length} student${parsed.rows.length === 1 ? '' : 's'}`}
        </button>
        {parsed.rows.length > 0 && !consent && <p className="muted t-hint">Tick the consent box to save.</p>}
      </section>
    </Page>
  );
}
