/** F4 teacher page (/teacher/classes/:classId/tests): create/open/close tests, live status, results, item review + override, paper marks, printable forms. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AssessmentKind, AssessmentResultRow, AssessmentWindowRes, PrintableForm, StudentAssessmentRes } from '@shabd/core';
import { ASSESSMENT_ITEM_MAX } from '@shabd/core';
import { assessmentApi } from '../../shared/research/assessment-api.ts';
import { errMsg, Page, SortTable, useLoad } from '../ui.tsx';

const KIND_LABEL: Record<AssessmentKind, string> = { pre: 'Pre-test', post: 'Post-test' };
const STATUS_LABEL: Record<string, string> = { not_started: 'Not started', in_progress: 'Writing now', submitted: 'Submitted', manual: 'Paper marks' };

export default function Assessments() {
  const params = useParams();
  const classId = Number(params.classId);
  const { data: windows, error, loading, reload } = useLoad(() => assessmentApi.list(classId), [classId]);
  const [printing, setPrinting] = useState<'A' | 'B' | null>(null);
  const [msg, setMsg] = useState('');

  if (printing) return <PrintView classId={classId} formId={printing} onClose={() => setPrinting(null)} />;
  const byKind = (k: AssessmentKind) => windows?.find((w) => w.kind === k);
  return (
    <Page classId={Number.isInteger(classId) ? classId : undefined} title="Tests" loading={loading} error={error ?? (msg || null)}>
      <p className="muted">Pre-test and post-test: 30 marks (A meanings 10, B parts of speech 10, C sentences 10). Children see no marks.</p>
      <div className="row no-print" style={{ flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => setPrinting('A')}>Print form A</button>
        <button className="btn" onClick={() => setPrinting('B')}>Print form B</button>
      </div>
      {(['pre', 'post'] as const).map((k) => {
        const w = byKind(k);
        return w
          ? <WindowCard key={w.id} w={w} classId={classId} onChanged={reload} onError={setMsg} />
          : <CreateCard key={k} kind={k} classId={classId} onCreated={reload} onError={setMsg} />;
      })}
    </Page>
  );
}

function CreateCard({ kind, classId, onCreated, onError }: { kind: AssessmentKind; classId: number; onCreated: () => void; onError: (m: string) => void }) {
  const [formId, setFormId] = useState<'A' | 'B'>(kind === 'pre' ? 'A' : 'B');
  const [mode, setMode] = useState<'app' | 'paper'>('app');
  const [dur, setDur] = useState(25);
  const create = async () => {
    onError('');
    try { await assessmentApi.create(classId, { kind, formId, mode, durationMin: dur }); onCreated(); } catch (e) { onError(errMsg(e)); }
  };
  return (
    <section className="card stack" aria-label={KIND_LABEL[kind]}>
      <h2>{KIND_LABEL[kind]}</h2>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <label>Form <select value={formId} onChange={(e) => setFormId(e.target.value as 'A' | 'B')}><option value="A">A</option><option value="B">B</option></select></label>
        <label>Mode <select value={mode} onChange={(e) => setMode(e.target.value as 'app' | 'paper')}><option value="app">In the app</option><option value="paper">On paper</option></select></label>
        <label>Minutes <input type="number" min={5} max={120} value={dur} onChange={(e) => setDur(Number(e.target.value))} style={{ width: 70 }} /></label>
      </div>
      <button className="btn btn-primary" onClick={() => void create()}>Create {KIND_LABEL[kind].toLowerCase()}</button>
    </section>
  );
}

function WindowCard({ w, classId, onChanged, onError }: { w: AssessmentWindowRes; classId: number; onChanged: () => void; onError: (m: string) => void }) {
  const [rows, setRows] = useState<AssessmentResultRow[]>([]);
  const [win, setWin] = useState(w);
  const [panel, setPanel] = useState<number | null>(null);
  const load = useCallback(async () => {
    try { const r = await assessmentApi.results(classId, w.id); setRows(r.rows); setWin(r.window); } catch (e) { onError(errMsg(e)); }
  }, [classId, w.id, onError]);
  useEffect(() => {
    void load();
    if (win.status !== 'open') return;
    const t = setInterval(() => { void load(); }, 8000); // live started/submitted
    return () => clearInterval(t);
  }, [load, win.status]);

  const act = async (body: Parameters<typeof assessmentApi.patch>[2]) => {
    onError('');
    try { setWin(await assessmentApi.patch(classId, w.id, body)); await load(); onChanged(); } catch (e) { onError(errMsg(e)); }
  };
  const reset = async (s: AssessmentResultRow) => {
    if (!window.confirm(`Let ${s.firstName} start again? Their answers will be deleted.`)) return;
    await act({ action: 'reset_attempt', studentId: s.studentId });
  };

  return (
    <section className="card stack" aria-label={KIND_LABEL[win.kind]}>
      <div className="t-card-main">
        <h2>{KIND_LABEL[win.kind]} · form {win.formId} · {win.mode === 'app' ? 'in the app' : 'on paper'} · {win.durationMin} min</h2>
        <span className="chip">{win.status === 'draft' ? 'Not opened' : win.status === 'open' ? 'Open' : 'Closed'}</span>
      </div>
      {win.mode === 'app' && win.status !== 'closed' && (
        <p>Test code for the board: <b className="test-code-big" style={{ fontSize: 40, letterSpacing: '0.2em' }}>{win.accessCode}</b></p>
      )}
      <p className="muted">{win.started} of {win.studentCount} started · {win.submitted} submitted</p>
      <div className="row no-print" style={{ flexWrap: 'wrap' }}>
        {win.status === 'draft' && <button className="btn btn-primary" onClick={() => void act({ action: 'open' })}>Open test</button>}
        {win.status === 'open' && <button className="btn" onClick={() => { if (window.confirm('Close the test? Children still writing will be submitted.')) void act({ action: 'close' }); }}>Close test</button>}
        {win.status === 'draft' && (
          <>
            <label>Form <select value={win.formId} onChange={(e) => void act({ action: 'update', formId: e.target.value as 'A' | 'B' })}><option value="A">A</option><option value="B">B</option></select></label>
            <label>Mode <select value={win.mode} onChange={(e) => void act({ action: 'update', mode: e.target.value as 'app' | 'paper' })}><option value="app">In the app</option><option value="paper">On paper</option></select></label>
          </>
        )}
      </div>
      <SortTable<AssessmentResultRow>
        caption={`${KIND_LABEL[win.kind]} results`}
        rows={rows}
        rowKey={(r) => r.studentId}
        initial={{ key: 'roll', dir: 'asc' }}
        cols={[
          { key: 'roll', label: 'Roll', get: (r) => r.rollNo },
          { key: 'name', label: 'Name', get: (r) => r.firstName },
          { key: 'status', label: 'Status', get: (r) => STATUS_LABEL[r.status] },
          { key: 'a', label: 'A /10', get: (r) => r.a },
          { key: 'b', label: 'B /10', get: (r) => r.b },
          { key: 'c', label: 'C /10', get: (r) => r.c },
          { key: 'total', label: 'Total /30', get: (r) => r.total },
          { key: 'review', label: 'To check', get: (r) => r.needsReview, render: (r) => (r.needsReview > 0 ? <b>{r.needsReview}</b> : <span>0</span>) },
          {
            key: 'act', label: '', get: () => '', render: (r) => (
              <span className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn" aria-label={`Review ${r.firstName}`} onClick={() => setPanel(panel === r.studentId ? null : r.studentId)}>{win.mode === 'paper' ? 'Marks' : 'Review'}</button>
                {r.status !== 'not_started' && r.status !== 'manual' && <button className="btn" aria-label={`Reset ${r.firstName}`} onClick={() => void reset(r)}>Reset</button>}
              </span>
            ),
          },
        ]}
      />
      {panel !== null && <StudentPanel key={`${w.id}-${panel}`} classId={classId} windowId={w.id} studentId={panel} onSaved={load} onError={onError} />}
    </section>
  );
}

function StudentPanel({ classId, windowId, studentId, onSaved, onError }: { classId: number; windowId: number; studentId: number; onSaved: () => Promise<void>; onError: (m: string) => void }) {
  const { data, error, reload } = useLoad(() => assessmentApi.studentDetail(classId, windowId, studentId), [classId, windowId, studentId]);
  const [manual, setManual] = useState<{ a: string; b: string; c: string } | null>(null);
  useEffect(() => { if (data) setManual({ a: String(data.manual?.a ?? ''), b: String(data.manual?.b ?? ''), c: String(data.manual?.c ?? '') }); }, [data]);
  if (error) return <div className="t-error" role="alert">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const setOverride = async (itemId: string, v: string) => {
    onError('');
    try { await assessmentApi.override(classId, windowId, studentId, itemId, v === '' ? null : Number(v)); reload(); await onSaved(); } catch (e) { onError(errMsg(e)); }
  };
  const saveManual = async () => {
    onError('');
    const n = manual ? [manual.a, manual.b, manual.c].map((x) => Number(x)) : [];
    if (n.length !== 3 || n.some((x, i) => ![manual!.a, manual!.b, manual!.c][i] || !Number.isInteger(x) || x < 0 || x > 10)) { onError('Each section mark must be a whole number from 0 to 10.'); return; }
    try { await assessmentApi.manual(classId, windowId, studentId, { a: n[0]!, b: n[1]!, c: n[2]! }); reload(); await onSaved(); } catch (e) { onError(errMsg(e)); }
  };
  return (
    <div className="card stack" role="region" aria-label={`${data.firstName}'s test`}>
      <h3>{data.firstName} (roll {data.rollNo}) · {STATUS_LABEL[data.status]}{data.total !== null ? ` · ${data.total}/30` : ''}</h3>
      <fieldset>
        <legend>Marks from a paper test (replace the app marks)</legend>
        {manual && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(['a', 'b', 'c'] as const).map((k) => (
              <label key={k}>Section {k.toUpperCase()} (0-10) <input type="number" min={0} max={10} value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} style={{ width: 70 }} /></label>
            ))}
            <button className="btn btn-primary" onClick={() => void saveManual()}>Save paper marks</button>
          </div>
        )}
      </fieldset>
      {data.items.length > 0 && <ItemReview items={data.items} onOverride={setOverride} />}
    </div>
  );
}

function ItemReview({ items, onOverride }: { items: StudentAssessmentRes['items']; onOverride: (itemId: string, v: string) => Promise<void> }) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const shown = onlyFlagged ? items.filter((i) => i.needsReview) : items;
  return (
    <div className="stack">
      <label><input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Show only answers to check</label>
      <div className="t-scroll">
        <table>
          <thead><tr><th>Q</th><th>Question</th><th>Answer</th><th>Model answer</th><th>Auto</th><th>Final marks</th></tr></thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.itemId}>
                <td>{i.itemId.toUpperCase()}{i.needsReview && i.overrideMarks === null ? ' ⚑' : ''}</td>
                <td>{i.prompt}</td>
                <td>{i.answer === '' ? <i>(blank)</i> : i.answer}</td>
                <td>{i.key}</td>
                <td>{i.autoMarks ?? '-'}</td>
                <td>
                  <select aria-label={`Marks for ${i.itemId.toUpperCase()}`} value={i.overrideMarks === null ? '' : String(i.overrideMarks)} onChange={(e) => void onOverride(i.itemId, e.target.value)}>
                    <option value="">Auto ({i.autoMarks ?? 0})</option>
                    {Array.from({ length: ASSESSMENT_ITEM_MAX[i.section] + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PrintView({ classId, formId, onClose }: { classId: number; formId: 'A' | 'B'; onClose: () => void }) {
  const { data, error } = useLoad<PrintableForm>(() => assessmentApi.printForm(formId), [formId]);
  const [key, setKey] = useState(false);
  return (
    <Page classId={Number.isInteger(classId) ? classId : undefined} title={`Form ${formId}`} error={error}>
      <div className="row no-print" style={{ flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Back</button>
        <label><input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} /> Show answer key and marking scheme</label>
        <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>
      {data && (
        <article className="stack">
          <p>Name: ______________________ Roll no: ______ Date: ____________ (30 marks, 25 minutes)</p>
          <h2>Part A: What does it mean? (10)</h2>
          <ol>
            {data.sectionA.map((q) => (
              <li key={q.id}>What does <b>{q.word}</b> mean?
                <ul style={{ listStyle: 'none' }}>{q.options.map((o) => <li key={o}>{key && o === q.answer ? '☑' : '☐'} {o}</li>)}</ul>
              </li>
            ))}
          </ol>
          <h2>Part B: What kind of word is the underlined word? (10)</h2>
          <ol start={11}>
            {data.sectionB.map((q) => (
              <li key={q.id}>{q.sentence.replace(q.target, `_${q.target}_`)}
                <div>{q.options.map((o) => <span key={o} style={{ marginRight: 16 }}>{key && o === q.answer ? '☑' : '☐'} {o}</span>)}</div>
              </li>
            ))}
          </ol>
          <h2>Part C: Write your own sentence (10)</h2>
          <ol start={21}>
            {data.sectionC.map((q) => (
              <li key={q.id}>Use the word <b>{q.word}</b>.<div>{key ? <i>Example: {q.example}</i> : '______________________________________________'}</div></li>
            ))}
          </ol>
          {key && <section><h2>Marking scheme</h2><ul>{data.scheme.map((s) => <li key={s}>{s}</li>)}</ul></section>}
        </article>
      )}
    </Page>
  );
}
