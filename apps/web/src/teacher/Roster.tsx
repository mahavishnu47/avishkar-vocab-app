import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { RosterStudent } from '@shabd/core';
import { api } from '../shared/api.ts';
import { errMsg, Page, SortTable, useLoad } from './ui.tsx';

function joinedText(s: RosterStudent): string {
  return s.firstLoginAt ? `✅ ${s.firstLoginAt.slice(0, 10)}` : 'not yet';
}

export function Roster() {
  const classId = Number(useParams().classId);
  const { data, setData, error, loading } = useLoad(() => api.roster(classId), [classId]);
  const [msg, setMsg] = useState<string | null>(null);

  const patch = (s: RosterStudent) => setData((data ?? []).map((x) => (x.id === s.id ? s : x)));
  const toggle = async (s: RosterStudent) => {
    try { patch(await api.updateStudent(s.id, { active: !s.active })); } catch (e) { setMsg(errMsg(e)); }
  };
  const reset = async (s: RosterStudent) => {
    if (!window.confirm(`Reset PIN for ${s.firstName}? They will be signed out on all phones.`)) return;
    try { const r = await api.resetPin(s.id); patch(r); setMsg(`New PIN for ${s.firstName}: ${r.pin}`); } catch (e) { setMsg(errMsg(e)); }
  };

  const nobodyJoined = !!data && data.some((s) => s.active) && data.every((s) => !s.firstLoginAt);
  return (
    <Page classId={classId} title="Roster" loading={loading} error={error}>
      {msg && <div className="feedback-ok" role="status">{msg}</div>}
      {data && (
        <>
          {data.length === 0 && (
            <section className="card stack">
              <p className="muted">No students yet. Paste your class list to add them.</p>
              <Link className="btn btn-primary" to={`/teacher/classes/${classId}/students/add`}>Add students</Link>
            </section>
          )}
          {nobodyJoined && (
            <section className="card row">
              <span className="muted">No one has joined yet. Send the link to parents.</span>
              <Link className="btn t-wa" to={`/teacher/classes/${classId}/share`}>WhatsApp</Link>
            </section>
          )}
          {data.length > 0 && (
            <SortTable
              rows={data} rowKey={(s) => s.id} caption="Students"
              cols={[
                { key: 'roll', label: 'Roll', get: (s) => s.rollNo },
                { key: 'name', label: 'Name', get: (s) => s.firstName, render: (s) => <span className="deva">{s.firstName}</span> },
                { key: 'avatar', label: 'Avatar', get: (s) => s.avatar },
                { key: 'pin', label: 'PIN', get: (s) => s.pin, render: (s) => <code className="t-pin">{s.pin}</code> },
                { key: 'joined', label: 'Joined', get: (s) => s.firstLoginAt ?? '', render: (s) => joinedText(s) },
                { key: 'locked', label: 'Locked', get: (s) => (s.locked ? 1 : 0), render: (s) => (s.locked ? <span role="img" aria-label="locked">🔒</span> : null) },
                { key: 'active', label: 'Active', get: (s) => (s.active ? 1 : 0), render: (s) => (
                  <input type="checkbox" aria-label={`${s.firstName} active`} checked={s.active} onChange={() => toggle(s)} />) },
                { key: 'reset', label: '', get: () => null, render: (s) => <button className="btn" onClick={() => reset(s)}>Reset PIN</button> },
              ]}
            />
          )}
          {data.length > 0 && <Link className="btn btn-primary" to={`/teacher/classes/${classId}/students/add`}>+ Add students</Link>}
        </>
      )}
    </Page>
  );
}
