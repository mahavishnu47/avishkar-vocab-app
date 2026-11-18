import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../shared/api.ts';
import { errMsg, Page, useLoad } from './ui.tsx';
import { istToday } from './util.ts';

export function Classes() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const showAll = params.get('all') === '1';
  const { data, error, loading, reload } = useLoad(() => api.listClasses(), []);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(istToday());
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // One class -> go straight to its dashboard.
  useEffect(() => {
    if (data && data.length === 1 && !showAll) navigate(`/teacher/classes/${data[0].id}/dashboard`, { replace: true });
  }, [data, navigate, showAll]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const c = await api.createClass({ name: name.trim(), startDate });
      setName(''); setAdding(false); reload();
      navigate(`/teacher/classes/${c.id}/roster`);
    } catch (err) { setFormError(errMsg(err)); }
  };

  return (
    <Page title="My classes" loading={loading} error={error}>
      {data && (
        <>
          <div className="stack">
            {data.length === 0 && <p className="muted">No classes yet. Create your first class below.</p>}
            {data.map((c) => (
              <Link key={c.id} to={`/teacher/classes/${c.id}/dashboard`} className="card t-class">
                <strong>{c.name}</strong>
                <span className="muted">Code <b className="t-code">{c.classCode}</b> · starts {c.startDate}</span>
              </Link>
            ))}
          </div>
          {adding || data.length === 0 ? (
            <form className="card stack" onSubmit={create}>
              <h2 className="t-h2">New class</h2>
              <label className="t-field">Class name (e.g. 5A)
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} />
              </label>
              <label className="t-field">Start date (day 1 of the word list)
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </label>
              {formError && <div className="t-error" role="alert">{formError}</div>}
              <button className="btn btn-primary">Create class</button>
            </form>
          ) : (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>+ New class</button>
          )}
        </>
      )}
    </Page>
  );
}
