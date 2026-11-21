import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { className } from '@shabd/core';
import { api, ApiRequestError } from '../shared/api.ts';
import { errMsg, Page } from './ui.tsx';
import { istToday } from './util.ts';

const STANDARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DIVISIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** One-step Create Class: standard + division chips, words start date, automatic name. */
export function NewClass() {
  const navigate = useNavigate();
  const [standard, setStandard] = useState(5);
  const [division, setDivision] = useState('A');
  const [other, setOther] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [changeDate, setChangeDate] = useState(false);
  const [startDate, setStartDate] = useState(istToday());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const div = other ? otherText.trim().toUpperCase() : division;
  const valid = /^[A-Z0-9]{0,3}$/.test(div);
  const name = className(standard, div);

  const pickDivision = (d: string) => { setOther(false); setDivision(division === d ? '' : d); };
  // State updates are not instant, so four fast taps all got through and made four classes: a ref blocks repeats at once (T-1).
  const sending = useRef(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    if (!valid) { setError('Use 1 to 3 letters or numbers for the division.'); return; }
    sending.current = true;
    setError(null); setBusy(true);
    try {
      const c = await api.createClass({ standard, division: div, startDate });
      navigate(`/teacher/classes/${c.id}/students/add`);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 409 ? `Class ${name} already exists in your school. Ask your school admin.` : errMsg(err));
      sending.current = false;
    } finally { setBusy(false); }
  };

  return (
    <Page title="Create class">
      <form className="card stack" onSubmit={submit}>
        <fieldset className="stack t-fieldset">
          <legend className="t-h2">Standard</legend>
          <div className="t-chips">
            {STANDARDS.map((n) => (
              <button type="button" key={n} className="t-chipbtn" aria-pressed={standard === n} aria-label={`Standard ${n}`} onClick={() => setStandard(n)}>{n}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="stack t-fieldset">
          <legend className="t-h2">Division</legend>
          <div className="t-chips">
            {DIVISIONS.map((d) => (
              <button type="button" key={d} className="t-chipbtn" aria-pressed={!other && division === d} aria-label={`Division ${d}`} onClick={() => pickDivision(d)}>{d}</button>
            ))}
            <button type="button" className="t-chipbtn" aria-pressed={other} onClick={() => setOther(!other)}>Other</button>
          </div>
          {other && (
            <label className="t-field">Division (1 to 3 characters)
              <input value={otherText} onChange={(e) => setOtherText(e.target.value)} maxLength={3} autoCapitalize="characters" />
            </label>
          )}
          <span className="muted t-hint">No division? Tap the selected letter to clear it.</span>
        </fieldset>
        <div className="stack">
          <span className="t-h2">Words start on</span>
          {changeDate ? (
            <input type="date" aria-label="Words start on" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} required />
          ) : (
            <div className="row">
              <span>{startDate === istToday() ? 'Today' : startDate}</span>
              <button type="button" className="btn t-link" onClick={() => setChangeDate(true)}>Change</button>
            </div>
          )}
        </div>
        <p className="t-preview">Class name: <b>{name}</b></p>
        {error && <div className="t-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !valid}>{busy ? 'Please wait…' : 'Create class'}</button>
      </form>
    </Page>
  );
}
