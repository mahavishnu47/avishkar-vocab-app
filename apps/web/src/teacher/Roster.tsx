import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { JoinRequest, RosterStudent } from '@shabd/core';
import { api } from '../shared/api.ts';
import { errMsg, Page, SortTable, useLoad } from './ui.tsx';

function joinedText(s: RosterStudent): string {
  return s.firstLoginAt ? `✅ ${s.firstLoginAt.slice(0, 10)}` : 'not yet';
}

/** Children who asked to join from the class link. Hidden when nobody is waiting. */
export function WaitingToJoin({ classId, onApproved, onMessage }: {
  classId: number; onApproved: (s: RosterStudent) => void; onMessage: (m: string) => void;
}) {
  const [reqs, setReqs] = useState<JoinRequest[]>([]);
  const [rolls, setRolls] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.joinRequests(classId).then((r) => { if (live) setReqs(r); }, () => {});
    return () => { live = false; };
  }, [classId]);
  if (reqs.length === 0) return null;

  const approve = async (r: JoinRequest) => {
    const typed = (rolls[r.id] ?? '').trim();
    const rollNo = typed === '' ? undefined : Number(typed);
    if (rollNo !== undefined && (!Number.isInteger(rollNo) || rollNo < 1)) { onMessage('Roll number must be a number like 12.'); return; }
    setBusy(r.id);
    try {
      const s = await api.approveJoinRequest(classId, r.id, rollNo === undefined ? undefined : { rollNo });
      setReqs((x) => x.filter((y) => y.id !== r.id));
      onApproved(s);
      onMessage(`${s.firstName} is in. PIN: ${s.pin}. Tell them their PIN.`);
    } catch (e) { onMessage(errMsg(e)); } finally { setBusy(null); }
  };
  const remove = async (r: JoinRequest) => {
    if (!window.confirm(`Remove the request from ${r.firstName}?`)) return;
    setBusy(r.id);
    try { await api.rejectJoinRequest(classId, r.id); setReqs((x) => x.filter((y) => y.id !== r.id)); } catch (e) { onMessage(errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <section className="card stack" aria-label="Waiting to join">
      <h2>Waiting to join ({reqs.length})</h2>
      <p className="muted">These children asked to join. Only approve students from your class.</p>
      {reqs.map((r) => (
        <div className="row" key={r.id}>
          <span className="deva">{r.firstName}</span>
          <input
            type="number" min={1} inputMode="numeric" style={{ width: 90 }}
            aria-label={`Roll number for ${r.firstName}`} placeholder={r.requestedRollNo ? String(r.requestedRollNo) : 'Roll no.'}
            value={rolls[r.id] ?? ''} onChange={(e) => setRolls({ ...rolls, [r.id]: e.target.value })}
          />
          <button className="btn btn-primary" disabled={busy === r.id} onClick={() => approve(r)}>Approve</button>
          <button className="btn" disabled={busy === r.id} onClick={() => remove(r)}>Remove</button>
        </div>
      ))}
    </section>
  );
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
          <WaitingToJoin
            classId={classId} onMessage={setMsg}
            onApproved={(s) => setData((d) => [...(d ?? []), s].sort((a, b) => a.rollNo - b.rollNo))}
          />
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
