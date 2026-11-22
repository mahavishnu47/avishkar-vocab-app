import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DayStatus } from '@shabd/core';
import { api } from '../shared/api.ts';
import { DateStepper, Page, SortTable, useLoad } from './ui.tsx';
import { istToday } from './util.ts';

const STATUS: Record<DayStatus, { icon: string; label: string; n: number }> = {
  completed: { icon: '✅', label: 'Completed', n: 2 },
  in_progress: { icon: '◐', label: 'In progress', n: 1 },
  not_started: { icon: '✗', label: 'Not started', n: 0 },
};

export function Dashboard() {
  const classId = Number(useParams().classId);
  const navigate = useNavigate();
  const today = istToday();
  const [date, setDate] = useState(today);
  const { data, error, loading } = useLoad(() => api.dashboard(classId, date), [classId, date]);
  return (
    <Page classId={classId} title="Today" loading={loading && !data} error={error}>
      <DateStepper date={date} onChange={setDate} />
      {data && (
        <>
          <section className="card stack">
            <div className="t-words">
              {data.set.words.map((w) => <span key={w.id} className="t-chip" title={w.meaning}>{w.word}</span>)}
            </div>
            <strong>{data.completedCount}/{data.students.length} completed</strong>
          </section>
          <SortTable
            rows={data.students} rowKey={(s) => s.studentId} onRow={(s) => navigate(`/teacher/students/${s.studentId}`)}
            initial={{ key: 'roll', dir: 'asc' }} caption="Students today"
            cols={[
              { key: 'roll', label: 'Roll', get: (s) => s.rollNo },
              { key: 'avatar', label: '', get: (s) => s.avatar },
              { key: 'name', label: 'Name', get: (s) => s.firstName, render: (s) => <span className="deva">{s.firstName}</span> },
              { key: 'status', label: 'Status', get: (s) => STATUS[s.status].n, render: (s) => <span>{STATUS[s.status].icon} {STATUS[s.status].label}</span> },
              { key: 'words', label: 'Words', get: (s) => s.wordsDone, render: (s) => `${s.wordsDone}/5` },
              { key: 'marks', label: 'Marks (of 500 for the 50 test words)', get: (s) => s.totalMarks },
              { key: 'streak', label: 'Streak', get: (s) => s.streak, render: (s) => `🔥 ${s.streak}` },
              { key: 'xp', label: 'XP week', get: (s) => s.xpWeek },
            ]}
          />
        </>
      )}
    </Page>
  );
}
