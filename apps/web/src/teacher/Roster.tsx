import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { StudentWithPin } from '@shabd/core';
import { api } from '../shared/api.ts';
import { errMsg, Page, SortTable, useLoad } from './ui.tsx';
import { parseRosterText } from './util.ts';

export function Roster() {
  const classId = Number(useParams().classId);
  const { data, setData, error, loading } = useLoad(() => api.roster(classId), [classId]);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());

  const parsed = parseRosterText(text, (data ?? []).map((s) => s.rollNo));

  const save = async () => {
    if (!parsed.rows.length || parsed.errors.length) return;
    setFormError(null);
    const before = new Set((data ?? []).map((s) => s.id));
    try {
      const res = await api.addStudents(classId, { students: parsed.rows });
      setData(res);
      setNewIds(new Set(res.filter((s) => !before.has(s.id)).map((s) => s.id)));
      setMsg(`Added ${res.length - before.size} students. PINs are shown below.`);
      setText(''); setAdding(false);
    } catch (e) { setFormError(errMsg(e)); }
  };

  const patch = (s: StudentWithPin) => setData((data ?? []).map((x) => (x.id === s.id ? s : x)));
  const toggle = async (s: StudentWithPin) => {
    try { patch(await api.updateStudent(s.id, { active: !s.active })); } catch (e) { setMsg(errMsg(e)); }
  };
  const reset = async (s: StudentWithPin) => {
    if (!window.confirm(`Reset PIN for ${s.firstName}?`)) return;
    try { const r = await api.resetPin(s.id); patch(r); setMsg(`New PIN for ${s.firstName}: ${r.pin}`); } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <Page classId={classId} title="Roster" loading={loading} error={error}>
      {msg && <div className="feedback-ok" role="status">{msg}</div>}
      {data && (
        <>
          <SortTable
            rows={data} rowKey={(s) => s.id} caption="Students"
            cols={[
              { key: 'roll', label: 'Roll', get: (s) => s.rollNo },
              { key: 'name', label: 'Name', get: (s) => s.firstName, render: (s) => <span className="deva">{s.firstName}{newIds.has(s.id) && <span className="t-badge">New</span>}</span> },
              { key: 'avatar', label: 'Avatar', get: (s) => s.avatar },
              { key: 'pin', label: 'PIN', get: (s) => s.pin, render: (s) => <code className="t-pin">{s.pin}</code> },
              { key: 'active', label: 'Active', get: (s) => (s.active ? 1 : 0), render: (s) => (
                <input type="checkbox" aria-label={`${s.firstName} active`} checked={s.active} onChange={() => toggle(s)} />) },
              { key: 'reset', label: '', get: () => null, render: (s) => <button className="btn" onClick={() => reset(s)}>Reset PIN</button> },
            ]}
          />
          {adding ? (
            <section className="card stack">
              <h2 className="t-h2">Add students</h2>
              <label className="t-field">One student per line: roll, name
                <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1, Riya\n2, Arjun\n3, सानिका'} />
              </label>
              {parsed.errors.map((er) => <div key={er} className="t-error">{er}</div>)}
              {parsed.rows.length > 0 && (
                <div className="t-scroll">
                  <table aria-label="Preview">
                    <thead><tr><th>Roll</th><th>Name</th></tr></thead>
                    <tbody>{parsed.rows.map((r) => <tr key={r.rollNo}><td>{r.rollNo}</td><td className="deva">{r.firstName}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              {formError && <div className="t-error" role="alert">{formError}</div>}
              <div className="row">
                <button className="btn btn-primary" disabled={!parsed.rows.length || parsed.errors.length > 0} onClick={save}>
                  Save {parsed.rows.length || ''} {parsed.rows.length === 1 ? 'student' : 'students'}
                </button>
                <button className="btn" onClick={() => { setAdding(false); setText(''); }}>Cancel</button>
              </div>
            </section>
          ) : (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add students</button>
          )}
        </>
      )}
    </Page>
  );
}
