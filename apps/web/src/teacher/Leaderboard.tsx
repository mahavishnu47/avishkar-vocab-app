import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { LeaderboardMode } from '@shabd/core';
import { api } from '../shared/api.ts';
import { errMsg, Page, useLoad } from './ui.tsx';

export function Leaderboard() {
  const classId = Number(useParams().classId);
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const lb = useLoad(() => api.classLeaderboard(classId, period), [classId, period]);
  const classes = useLoad(() => api.listClasses(), []);
  const [err, setErr] = useState<string | null>(null);
  const cls = classes.data?.find((c) => c.id === classId);
  const shown = cls?.leaderboardMode !== 'hidden';

  const setMode = async (mode: LeaderboardMode) => {
    try { await api.updateClass(classId, { leaderboardMode: mode }); classes.reload(); } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Page classId={classId} title="Leaderboard" loading={lb.loading} error={lb.error ?? err}>
      <div className="row t-tabs" role="tablist">
        <button role="tab" aria-selected={period === 'week'} className={`btn ${period === 'week' ? 'btn-primary' : ''}`} onClick={() => setPeriod('week')}>This week</button>
        <button role="tab" aria-selected={period === 'all'} className={`btn ${period === 'all' ? 'btn-primary' : ''}`} onClick={() => setPeriod('all')}>All time</button>
      </div>
      {cls && (
        <label className="row t-toggle">
          <input type="checkbox" checked={shown} onChange={(e) => setMode(e.target.checked ? 'individual' : 'hidden')} />
          <span>Show leaderboard to students</span>
        </label>
      )}
      {lb.data && (
        <div className="t-scroll">
          <table>
            <thead><tr><th>#</th><th>Student</th><th>XP</th></tr></thead>
            <tbody>
              {lb.data.entries.map((e) => (
                <tr key={e.studentId}><td>{e.rank}</td><td className="deva">{e.avatar} {e.firstName}</td><td>{e.xp}</td></tr>
              ))}
              {lb.data.entries.length === 0 && <tr><td colSpan={3} className="muted">No XP yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
