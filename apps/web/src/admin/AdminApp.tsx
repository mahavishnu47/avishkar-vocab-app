/** Super admin page (/admin). The secret is typed once and kept in sessionStorage only. Not linked from anywhere, noindex. */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminSchoolRow, InviteWithText } from '@shabd/core';
import { ApiRequestError, api, getAdminSecret, setAdminSecret } from '../shared/api.ts';
import '../school/school.css';
import { ShareBox } from '../school/ShareBox.tsx';
import { errMsg, formatWhen, mockRequested } from '../school/util.ts';

interface Card { title: string; url: string; code: string; text: string }

export function adminErrMsg(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.status === 404) return 'The admin tool is turned off on this server.';
    if (e.status === 401) return 'Wrong secret.';
  }
  return errMsg(e);
}

function Admin({ onSignOut }: { onSignOut: () => void }) {
  const [rows, setRows] = useState<AdminSchoolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [udise, setUdise] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await api.admin.listSchools()); setError(null); } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 401 || e.status === 404)) { onSignOut(); return; }
      setError(adminErrMsg(e));
    }
  }, [onSignOut]);
  useEffect(() => { void load(); }, [load]);

  const udiseOk = udise === '' || /^\d{11}$/.test(udise);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !udiseOk || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await api.admin.createSchool({ name: name.trim(), ...(district.trim() ? { district: district.trim() } : {}), ...(udise ? { udiseCode: udise } : {}) });
      setCard({ title: `${r.school.name} is ready`, url: r.setupInvite.url, code: r.setupInvite.code, text: r.whatsappText });
      setName(''); setDistrict(''); setUdise(''); setShowForm(false);
      await load();
    } catch (err) { setError(adminErrMsg(err)); }
    setBusy(false);
  };
  const newLink = async (r: AdminSchoolRow) => {
    setError(null);
    try {
      const inv: InviteWithText = await api.admin.setupLink(r.school.id);
      setCard({ title: `New setup link for ${r.school.name}`, url: inv.url, code: inv.code, text: inv.whatsappText });
    } catch (err) { setError(adminErrMsg(err)); }
  };
  const toggle = async (r: AdminSchoolRow) => {
    setError(null);
    try { await api.admin.updateSchool(r.school.id, { status: r.school.status === 'active' ? 'suspended' : 'active' }); await load(); } catch (err) { setError(adminErrMsg(err)); }
  };

  return (
    <main className="teacher screen s-admin">
      <nav className="t-nav" aria-label="Super admin">
        <span className="t-brand">🦜 Shabd Mitra admin</span>
        <button className="btn t-logout" onClick={onSignOut}>Sign out</button>
      </nav>
      {error && <p className="t-error" role="alert">{error}</p>}

      {card && (
        <section className="card stack" aria-label="Setup link">
          <h2 className="t-h2">{card.title}</h2>
          <p className="muted">Send this link to the principal. It works once.</p>
          <ShareBox url={card.url} code={card.code} text={card.text} label="setup link" />
          <button className="btn" onClick={() => setCard(null)}>Done</button>
        </section>
      )}

      {showForm ? (
        <form className="card stack" onSubmit={create} aria-label="New school">
          <h2 className="t-h2">New school</h2>
          <label className="t-field">School name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
          <label className="t-field">District (optional)<input value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={60} /></label>
          <label className="t-field">UDISE code (optional, 11 digits)
            <input value={udise} onChange={(e) => setUdise(e.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" />
          </label>
          {!udiseOk && <p className="t-warn">UDISE code has 11 digits.</p>}
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={!name.trim() || !udiseOk || busy}>Create</button>
            <button className="btn" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New school</button>
      )}

      {rows && rows.length === 0 && <p className="card">No schools yet.</p>}
      {rows && rows.length > 0 && (
        <div className="t-scroll">
          <table>
            <thead><tr><th>School</th><th>Status</th><th>Teachers</th><th>Classes</th><th>Students</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.school.id}>
                  <td><strong>{r.school.name}</strong><div className="muted">{r.school.district}</div></td>
                  <td>{r.school.status === 'active' ? 'Active' : <span className="t-badge t-badge-warn">Suspended</span>}</td>
                  <td>{r.teachers}</td><td>{r.classes}</td><td>{r.students}</td>
                  <td>{formatWhen(r.createdAt)}</td>
                  <td>
                    <div className="s-rowactions">
                      <button className="btn" onClick={() => newLink(r)}>New setup link</button>
                      <button className="btn" onClick={() => toggle(r)}>{r.school.status === 'active' ? 'Suspend' : 'Resume'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function SecretPrompt({ onSubmit, error }: { onSubmit: (s: string) => void; error: string | null }) {
  const [v, setV] = useState('');
  return (
    <main className="teacher screen t-login">
      <h1 className="title">Admin</h1>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (v) onSubmit(v); }}>
        <label className="t-field">Admin secret
          <input type="password" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />
        </label>
        {error && <p className="t-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={!v}>Open</button>
      </form>
    </main>
  );
}

export default function AdminApp() {
  const [ready, setReady] = useState(!mockRequested('admin.mock'));
  const [authed, setAuthed] = useState(!!getAdminSecret());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex';
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
  useEffect(() => {
    if (ready) return;
    import('../school/dev-mock.ts').then((m) => { m.installMock(); setReady(true); });
  }, [ready]);

  const signOut = useCallback(() => { setAdminSecret(null); setAuthed(false); }, []);
  const enter = async (secret: string) => {
    setAdminSecret(secret); setError(null);
    try { await api.admin.listSchools(); setAuthed(true); } catch (e) {
      if (e instanceof ApiRequestError && e.status !== 401 && e.status !== 404 && e.status !== 429) { setAuthed(true); return; }
      setAdminSecret(null); setError(adminErrMsg(e));
    }
  };
  if (!ready) return <main className="teacher screen"><p className="muted">Loading mock…</p></main>;
  return authed ? <Admin onSignOut={signOut} /> : <SecretPrompt onSubmit={enter} error={error} />;
}
