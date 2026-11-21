import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ClassSummary } from '@shabd/core';
import { api } from '../shared/api.ts';
import { Checklist } from './Checklist.tsx';
import { Page, useLoad } from './ui.tsx';

/** What to do next, shown once the first student has joined. */
function nextHint(classes: ClassSummary[]): { text: string; label: string; to: string } | null {
  const waiting = classes.find((c) => c.studentCount > c.joinedCount);
  if (waiting) {
    const n = waiting.studentCount - waiting.joinedCount;
    return { text: `${n} student${n === 1 ? ' has' : 's have'} not joined yet.`, label: 'Share again', to: `/teacher/classes/${waiting.id}/share` };
  }
  const played = classes.find((c) => c.completedToday > 0);
  if (played) return { text: 'Students are playing today.', label: 'See who played today', to: `/teacher/classes/${played.id}/dashboard` };
  if (classes[0]) return { text: "Check today's words.", label: 'Words', to: `/teacher/classes/${classes[0].id}/words` };
  return null;
}

export function Home() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const showAll = params.get('all') === '1';
  const { data, error, loading } = useLoad(() => api.teacherOverview(), []);

  // Checklist finished and exactly one class -> straight to its dashboard.
  useEffect(() => {
    if (data && data.checklist.done && data.classes.length === 1 && !showAll) {
      navigate(`/teacher/classes/${data.classes[0].id}/dashboard`, { replace: true });
    }
  }, [data, navigate, showAll]);

  const body = () => {
    if (!data) return null;
    const { classes, checklist } = data;
    const empty = classes.find((c) => c.studentCount === 0);
    const addTarget = empty ?? classes[0];
    const shareTarget = classes.find((c) => c.studentCount > 0) ?? classes[0];
    const totalStudents = classes.reduce((a, c) => a + c.studentCount, 0);
    const totalJoined = classes.reduce((a, c) => a + c.joinedCount, 0);
    const hint = checklist.firstStudentJoined ? nextHint(classes) : null;
    return (
      <>
        <p className="muted">{data.school.name} · {data.teacher.name}</p>
        {!checklist.firstStudentJoined && (
          <Checklist
            title="What to do next"
            items={[
              { done: checklist.classCreated, label: 'Create your class', action: { label: 'Create class', to: '/teacher/classes/new' } },
              { done: checklist.studentsAdded, label: 'Add your students',
                action: addTarget ? { label: 'Add students', to: `/teacher/classes/${addTarget.id}/students/add` } : undefined },
              { done: checklist.linkShared, label: 'Share the join link with parents',
                action: shareTarget ? { label: 'Share link', to: `/teacher/classes/${shareTarget.id}/share` } : undefined },
              { done: checklist.firstStudentJoined, label: totalStudents ? `First student joined (${totalJoined} of ${totalStudents} joined)` : 'First student joined' },
            ]}
          />
        )}
        {hint && (
          <section className="card row" aria-label="Next">
            <span className="t-check-label"><b>Next:</b> {hint.text}</span>
            <Link className="btn btn-primary" to={hint.to}>{hint.label}</Link>
          </section>
        )}
        <p className="muted">💡 Words for each day are ready. Change them any time in <b>Words</b>.</p>
        {classes.length > 0 && (
          <div className="stack">
            {classes.map((c) => (
              <article key={c.id} className="card stack">
                <Link to={`/teacher/classes/${c.id}/dashboard`} className="t-class">
                  <strong>Class {c.name}</strong>
                  <span className="muted">Code <b className="t-code">{c.classCode}</b></span>
                </Link>
                <div className="t-class-meta">
                  <span>{c.studentCount} students</span>
                  <span>Joined {c.joinedCount}/{c.studentCount}</span>
                  <span>Played today {c.completedToday}</span>
                </div>
                {c.studentCount === 0
                  ? <div className="t-actions"><Link className="btn btn-primary" to={`/teacher/classes/${c.id}/students/add`}>Add students</Link></div>
                  : c.joinedCount === 0 && (
                    <div className="t-actions">
                      <span className="muted">No one has joined yet. Send the link to parents.</span>
                      <Link className="btn t-wa" to={`/teacher/classes/${c.id}/share`}>WhatsApp</Link>
                    </div>
                  )}
              </article>
            ))}
          </div>
        )}
        {classes.length > 0 && <Link className="btn" to="/teacher/classes/new">+ New class</Link>}
      </>
    );
  };
  return <Page title="Home" loading={loading} error={error}>{body()}</Page>;
}
