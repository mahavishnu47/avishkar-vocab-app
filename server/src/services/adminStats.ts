/**
 * Super admin dashboard queries: platform overview, school detail, global activity feed.
 * Read-only aggregates. Never returns student names, PINs, password hashes, tokens, sentence text or audit meta.
 */
import { addDays } from '@shabd/core';
import type { AdminActivityEntry, AdminClassRow, AdminOverview, AdminSchoolDetail, AdminTeacherRow } from '@shabd/core';
import type { Queryable } from '../db/db.ts';
import { today } from '../clock.ts';
import { getAdminSchool } from './schools.ts';

export const APP_VERSION = '0.1.0';
const n = (v: unknown): number => Number(v ?? 0);

export async function getOverview(q: Queryable): Promise<AdminOverview> {
  const d0 = today();
  const d7 = addDays(d0, -6);
  const d30 = addDays(d0, -29);

  const totals = (await q.get(
    `SELECT
       (SELECT count(*) FROM schools WHERE status = 'active') AS schools_active,
       (SELECT count(*) FROM schools WHERE status = 'suspended') AS schools_suspended,
       (SELECT count(*) FROM teachers WHERE active = 1) AS teachers,
       (SELECT count(*) FROM classes WHERE archived = 0) AS classes,
       (SELECT count(*) FROM students WHERE active = 1) AS students,
       (SELECT count(*) FROM join_requests WHERE status = 'pending') AS join_pending,
       (SELECT count(*) FROM studies WHERE status = 'running') AS studies_running,
       (SELECT count(*) FROM words) AS words,
       (SELECT count(*) FROM schema_migrations) AS migrations,
       (SELECT max(version) FROM schema_migrations) AS latest_migration`,
  ))!;

  const act = (await q.get(
    `SELECT
       count(DISTINCT student_id) FILTER (WHERE date = ?) AS students_today,
       count(DISTINCT student_id) FILTER (WHERE date >= ?) AS students_7d,
       count(DISTINCT student_id) AS students_30d,
       count(*) FILTER (WHERE date = ? AND completed_at IS NOT NULL) AS done_today,
       count(*) FILTER (WHERE date >= ? AND completed_at IS NOT NULL) AS done_7d
     FROM sessions WHERE date >= ? AND date <= ?`,
    [d0, d7, d0, d7, d30, d0],
  ))!;
  const words7d = (await q.get(
    'SELECT count(*) AS c FROM word_scores ws JOIN sessions se ON se.id = ws.session_id WHERE se.date >= ? AND se.date <= ?',
    [d7, d0],
  ))!;

  const series = await q.all(
    `SELECT date, count(DISTINCT student_id) AS active, count(*) FILTER (WHERE completed_at IS NOT NULL) AS done
     FROM sessions WHERE date >= ? AND date <= ? GROUP BY date`,
    [d30, d0],
  );
  const byDate = new Map(series.map((r) => [r.date as string, r]));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(d30, i);
    const r = byDate.get(date);
    return { date, activeStudents: n(r?.active), sessionsCompleted: n(r?.done) };
  });

  const top = await q.all(
    `SELECT s.id, s.name,
       count(DISTINCT se.student_id) AS active7d,
       (SELECT count(*) FROM students st JOIN classes c2 ON c2.id = st.class_id WHERE c2.school_id = s.id AND st.active = 1) AS students
     FROM schools s
     JOIN classes c ON c.school_id = s.id
     JOIN sessions se ON se.class_id = c.id AND se.date >= ? AND se.date <= ?
     GROUP BY s.id, s.name
     ORDER BY active7d DESC, s.id ASC LIMIT 5`,
    [d7, d0],
  );

  return {
    totals: {
      schoolsActive: n(totals.schools_active), schoolsSuspended: n(totals.schools_suspended), teachers: n(totals.teachers),
      classes: n(totals.classes), students: n(totals.students), joinRequestsPending: n(totals.join_pending), studiesRunning: n(totals.studies_running),
    },
    activity: {
      studentsToday: n(act.students_today), students7d: n(act.students_7d), students30d: n(act.students_30d),
      sessionsCompletedToday: n(act.done_today), sessionsCompleted7d: n(act.done_7d), wordsCompleted7d: n(words7d.c),
    },
    daily,
    health: {
      db: 'ok', migrationsApplied: n(totals.migrations), latestMigration: totals.latest_migration == null ? null : n(totals.latest_migration),
      wordsLoaded: n(totals.words), appVersion: APP_VERSION, serverTime: new Date().toISOString(),
    },
    topSchools: top.map((r) => ({ schoolId: n(r.id), name: r.name as string, activeStudents7d: n(r.active7d), students: n(r.students) })),
  };
}

const ACTIVITY_SQL = `
  SELECT a.id, a.created_at, a.school_id, sc.name AS school_name, a.actor_type, a.action, a.target_type, a.target_id
  FROM audit_log a LEFT JOIN schools sc ON sc.id = a.school_id`;

const activityOf = (r: Record<string, unknown>): AdminActivityEntry => ({
  id: n(r.id), at: r.created_at as string, schoolId: r.school_id == null ? null : n(r.school_id),
  schoolName: (r.school_name as string | null) ?? null, actorType: r.actor_type as AdminActivityEntry['actorType'],
  action: r.action as string, targetType: (r.target_type as string | null) ?? null, targetId: r.target_id == null ? null : n(r.target_id),
});

export async function listActivity(q: Queryable, limit: number, schoolId?: number): Promise<AdminActivityEntry[]> {
  const rows = schoolId === undefined
    ? await q.all(`${ACTIVITY_SQL} ORDER BY a.id DESC LIMIT ?`, [limit])
    : await q.all(`${ACTIVITY_SQL} WHERE a.school_id = ? ORDER BY a.id DESC LIMIT ?`, [schoolId, limit]);
  return rows.map(activityOf);
}

export async function getSchoolDetail(q: Queryable, schoolId: number): Promise<AdminSchoolDetail> {
  const row = await getAdminSchool(q, schoolId); // 404 when missing
  const d7 = addDays(today(), -6);
  const teachers = (await q.all(
    'SELECT id, name, email, role, active, last_login_at FROM teachers WHERE school_id = ? ORDER BY active DESC, role, id',
    [schoolId],
  )).map((t): AdminTeacherRow => ({
    id: n(t.id), name: t.name as string, email: t.email as string, role: t.role as AdminTeacherRow['role'],
    active: n(t.active) === 1, lastLoginAt: (t.last_login_at as string | null) ?? null,
  }));
  const classes = (await q.all(
    `SELECT c.id, c.name, c.class_code, c.archived,
       (SELECT count(*) FROM students st WHERE st.class_id = c.id AND st.active = 1) AS students,
       (SELECT count(DISTINCT se.student_id) FROM sessions se WHERE se.class_id = c.id AND se.date >= ?) AS active7d
     FROM classes c WHERE c.school_id = ? ORDER BY c.archived, c.standard, c.division, c.id`,
    [d7, schoolId],
  )).map((c): AdminClassRow => ({
    id: n(c.id), name: c.name as string, classCode: c.class_code as string, students: n(c.students), active7d: n(c.active7d), archived: n(c.archived) === 1,
  }));
  return { row, teachers, classes, recentActivity: await listActivity(q, 20, schoolId) };
}
