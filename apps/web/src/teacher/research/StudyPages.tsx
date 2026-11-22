/** F1 teacher pages (route /teacher/study/*): study list, create, study home, participants (consent) and the printable code sheet. */
import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import type { ClassRoom, ConsentStatus, Study, StudyGroup, StudyParticipant, StudyStatus } from '@shabd/core';
import { CONSENT_STATUSES } from '@shabd/core';
import { api } from '../../shared/api.ts';
import { studyApi } from '../../shared/research/study-api.ts';
import { errMsg, Page, SortTable, useLoad } from '../ui.tsx';

const GROUP_LABEL: Record<StudyGroup, string> = { intervention: 'Intervention', comparison: 'Comparison' };
const CONSENT_LABEL: Record<ConsentStatus, string> = { pending: 'Pending', given: 'Given', declined: 'Declined', withdrawn: 'Withdrawn' };
const STATUS_LABEL: Record<StudyStatus, string> = { setup: 'Setup', running: 'Running', closed: 'Closed' };

export default function StudyPages() {
  return (
    <Routes>
      <Route index element={<StudyList />} />
      <Route path="new" element={<NewStudy />} />
      <Route path=":studyId" element={<StudyHome />} />
      <Route path=":studyId/participants" element={<Participants />} />
      <Route path=":studyId/codes" element={<CodeSheet />} />
      <Route path="*" element={<Page title="Study"><p className="muted">We can't find that page.</p><Link className="btn" to="/teacher/study">Back to studies</Link></Page>} />
    </Routes>
  );
}

function StudyList() {
  const { data, error, loading } = useLoad(() => studyApi.list(), []);
  return (
    <Page title="Research studies" loading={loading} error={error}>
      <Link className="btn btn-primary" to="/teacher/study/new">+ New study</Link>
      {data && data.length === 0 && <section className="card"><p className="muted">No study yet. Create one to give your students anonymous study codes and record parent consent.</p></section>}
      {data?.map((s) => (
        <Link key={s.id} to={`/teacher/study/${s.id}`} className="card t-class">
          <strong>{s.name}</strong>
          <span className="muted">{STATUS_LABEL[s.status]} · starts {s.startDate} · {s.classes.length} class{s.classes.length === 1 ? '' : 'es'}</span>
          <span className="muted">Consent given: {s.consent.given} of {s.consent.total}</span>
        </Link>
      ))}
    </Page>
  );
}

function NewStudy() {
  const navigate = useNavigate();
  const { data: classes, error, loading } = useLoad(() => api.listClasses(), []);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [schoolDays, setSchoolDays] = useState('10');
  const [picked, setPicked] = useState<Record<number, StudyGroup | ''>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const s = await studyApi.create({
        name,
        ...(startDate ? { startDate } : {}),
        schoolDays: Number(schoolDays),
        classes: Object.entries(picked).filter(([, g]) => g).map(([id, g]) => ({ classId: Number(id), group: g as StudyGroup })),
      });
      navigate(`/teacher/study/${s.id}`);
    } catch (err) {
      setMsg(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <Page title="New study" loading={loading} error={error}>
      <form className="card stack" onSubmit={submit}>
        <label className="t-field">Study name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="Word-a-Day" />
        </label>
        <label className="t-field">Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="t-field">School days
          <input type="number" min={1} max={60} value={schoolDays} onChange={(e) => setSchoolDays(e.target.value)} />
        </label>
        <fieldset className="stack">
          <legend className="t-h3">Classes</legend>
          {classes?.length === 0 && <p className="muted">Create a class first.</p>}
          {classes?.map((c: ClassRoom) => (
            <label key={c.id} className="t-field">{c.name}
              <select aria-label={`Group for ${c.name}`} value={picked[c.id] ?? ''} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.value as StudyGroup | '' })}>
                <option value="">Not in this study</option>
                <option value="intervention">Intervention</option>
                <option value="comparison">Comparison</option>
              </select>
            </label>
          ))}
        </fieldset>
        {msg && <div className="t-error" role="alert">{msg}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || name.trim() === ''}>Create study</button>
      </form>
    </Page>
  );
}

function StudyHome() {
  const id = Number(useParams().studyId);
  const { data, setData, error, loading } = useLoad(() => studyApi.get(id), [id]);
  const classes = useLoad(() => api.listClasses(), []);
  const [msg, setMsg] = useState<string | null>(null);
  const [addId, setAddId] = useState('');
  const [addGroup, setAddGroup] = useState<StudyGroup>('comparison');

  const run = async (fn: () => Promise<Study>) => {
    setMsg(null);
    try { setData(await fn()); } catch (e) { setMsg(errMsg(e)); }
  };
  const free = classes.data?.filter((c) => !data?.classes.some((x) => x.classId === c.id)) ?? [];
  const s = data;

  return (
    <Page title={s?.name ?? 'Study'} loading={loading} error={error}>
      {msg && <div className="t-error" role="alert">{msg}</div>}
      {s && s.status === "running" && new Date().getTime() > new Date(s.startDate + "T00:00:00").getTime() + Math.ceil(s.schoolDays * 7 / 5 + 7) * 86400000 && (
        <div className="card" role="status">⏰ This study's school days are over. When all tests are in, set the status below to <b>Closed</b> so results are final.</div>
      )}
      {s && (
        <>
          <section className="card stack">
            <label className="t-field">Status
              <select value={s.status} onChange={(e) => run(() => studyApi.update(id, { status: e.target.value as StudyStatus }))}>
                {(['setup', 'running', 'closed'] as const).map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
              </select>
            </label>
            <p className="muted">Starts {s.startDate} · {s.schoolDays} school days · {s.wordsPerDay} words a day</p>
            <p>Consent: <strong>{s.consent.given}</strong> given, {s.consent.pending} pending, {s.consent.declined} declined, {s.consent.withdrawn} withdrawn. Analysable: <strong>{s.consent.analysable}</strong> of {s.consent.total}.</p>
          </section>

          <section className="card stack">
            <h2 className="t-h2">Classes</h2>
            {s.classes.length === 0 && <p className="muted">No class yet. Add one below.</p>}
            {s.classes.map((c) => (
              <div key={c.classId} className="row">
                <span><strong>{c.className}</strong> · {GROUP_LABEL[c.group]} · {c.studentCount} students</span>
                {s.status === 'setup' && <button className="btn" onClick={() => run(() => studyApi.detachClass(id, c.classId))}>Remove {c.className}</button>}
              </div>
            ))}
            {s.status !== 'closed' && free.length > 0 && (
              <div className="row t-range">
                <select aria-label="Class to add" value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Add a class…</option>
                  {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select aria-label="Group of the new class" value={addGroup} onChange={(e) => setAddGroup(e.target.value as StudyGroup)}>
                  <option value="intervention">Intervention</option>
                  <option value="comparison">Comparison</option>
                </select>
                <button className="btn" disabled={!addId} onClick={() => { void run(() => studyApi.attachClass(id, Number(addId), addGroup)); setAddId(''); }}>Add class</button>
              </div>
            )}
          </section>

          <section className="card stack">
            <h2 className="t-h2">Study tools</h2>
            <Link className="btn btn-primary" to={`/teacher/study/${id}/participants`}>Students and consent</Link>
            <Link className="btn" to={`/teacher/study/${id}/codes`}>Print code sheet</Link>
            <Link className="btn" to={`/teacher/study/${id}/words`}>Words plan</Link>
            <Link className="btn" to={`/teacher/study/${id}/instruments`}>Observations</Link>
            <Link className="btn" to={`/teacher/study/${id}/results`}>Results</Link>
            {s.classes.map((c) => <Link key={c.classId} className="btn" to={`/teacher/classes/${c.classId}/tests`}>Tests for {c.className}</Link>)}
            {s.classes.map((c) => <Link key={`p${c.classId}`} className="btn" to={`/teacher/classes/${c.classId}/progress`}>Progress for {c.className}</Link>)}
          </section>
        </>
      )}
    </Page>
  );
}

function Participants() {
  const id = Number(useParams().studyId);
  const { data, setData, error, loading } = useLoad(() => studyApi.sync(id), [id]);
  const [msg, setMsg] = useState<string | null>(null);

  const replace = (p: StudyParticipant) => setData((data ?? []).map((x) => (x.studentId === p.studentId ? p : x)));
  const patch = async (p: StudyParticipant, body: { consent?: ConsentStatus; excluded?: boolean }) => {
    setMsg(null);
    try { replace(await studyApi.updateParticipant(id, p.studentId, body)); } catch (e) { setMsg(errMsg(e)); }
  };
  const withdraw = async (p: StudyParticipant) => {
    if (!window.confirm(`Delete research data for ${p.studyCode}? This removes their test and observation data and cannot be undone. Class activity stays.`)) return;
    setMsg(null);
    try { replace(await studyApi.withdraw(id, p.studentId)); setMsg(`Research data for ${p.studyCode} deleted.`); } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <Page title="Students and consent" loading={loading} error={error}>
      <p className="muted">Tick consent for each child whose parent returned the form. Children without consent can still use the app, but are left out of all research data.</p>
      {msg && <div className="feedback-ok" role="status">{msg}</div>}
      {data && (
        <SortTable
          rows={data} rowKey={(p) => p.studentId} caption="Study participants" initial={{ key: 'code', dir: 'asc' }}
          cols={[
            { key: 'code', label: 'Code', get: (p) => p.studyCode, render: (p) => <code className="t-code">{p.studyCode}</code> },
            { key: 'roll', label: 'Roll', get: (p) => p.rollNo },
            { key: 'name', label: 'Name', get: (p) => p.firstName },
            { key: 'class', label: 'Class', get: (p) => p.className },
            {
              key: 'consent', label: 'Consent', get: (p) => p.consent,
              render: (p) => (
                <select aria-label={`Consent for ${p.studyCode}`} value={p.consent} onChange={(e) => patch(p, { consent: e.target.value as ConsentStatus })}>
                  {CONSENT_STATUSES.map((c) => <option key={c} value={c}>{CONSENT_LABEL[c]}</option>)}
                </select>
              ),
            },
            {
              key: 'excluded', label: 'Exclude', get: (p) => (p.excluded ? 1 : 0),
              render: (p) => <input type="checkbox" aria-label={`Exclude ${p.studyCode}`} checked={p.excluded} onChange={(e) => patch(p, { excluded: e.target.checked })} />,
            },
            { key: 'analysable', label: 'In research', get: (p) => (p.analysable ? 1 : 0), render: (p) => (p.analysable ? 'Yes' : 'No') },
            { key: 'withdraw', label: '', get: () => null, render: (p) => <button className="btn" onClick={() => withdraw(p)}>Delete research data</button> },
          ]}
        />
      )}
      <div className="row">
        <Link className="btn" to={`/teacher/study/${id}`}>Back to study</Link>
        <Link className="btn btn-primary" to={`/teacher/study/${id}/codes`}>Code sheet</Link>
      </div>
    </Page>
  );
}

function CodeSheet() {
  const id = Number(useParams().studyId);
  const { data, error, loading } = useLoad(() => studyApi.sync(id), [id]);
  const study = useLoad(() => studyApi.get(id), [id]);
  return (
    <Page title="Code sheet" loading={loading} error={error}>
      <p className="muted no-print">Keep this sheet in the school file. Never share it or send it with exports: study codes are the only identifier in research data.</p>
      <button className="btn btn-primary no-print" onClick={() => window.print()}>Print</button>
      <h2 className="t-h2">{study.data?.name ?? 'Study'}: study codes</h2>
      <div className="t-scroll">
        <table aria-label="Study codes">
          <thead><tr><th>Code</th><th>Class</th><th>Roll</th><th>First name</th></tr></thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.studentId}><td><code className="t-code">{p.studyCode}</code></td><td>{p.className}</td><td>{p.rollNo}</td><td>{p.firstName}</td></tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={4} className="muted">No students yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Link className="btn no-print" to={`/teacher/study/${id}`}>Back to study</Link>
    </Page>
  );
}
