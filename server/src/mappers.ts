/**
 * DB row -> API object mappers shared by routes.
 */
import type { ClassRoom, LeaderboardMode, RosterStudent, StaffRole, Student, StudentWithPin, Teacher } from '@shabd/core';
import type { Queryable } from './db/db.ts';
import { notFound } from './http.ts';

type Row = Record<string, unknown>;

export const teacherOf = (r: Row): Teacher => ({
  id: r.id as number,
  name: r.name as string,
  email: r.email as string,
  schoolId: r.school_id as number,
  role: r.role as StaffRole,
  active: r.active === 1,
});

export const classOf = (r: Row): ClassRoom => ({
  id: r.id as number,
  teacherId: r.teacher_id as number,
  name: r.name as string,
  classCode: r.class_code as string,
  startDate: r.start_date as string,
  leaderboardMode: r.leaderboard_mode as LeaderboardMode,
  schoolId: r.school_id as number,
  standard: r.standard as number,
  division: r.division as string,
  academicYear: r.academic_year as string,
  archived: r.archived === 1,
  joinEnabled: r.join_enabled === 1,
  linkSharedAt: (r.link_shared_at as string | null) ?? null,
  consentAttestedAt: (r.consent_attested_at as string | null) ?? null,
});

export const studentOf = (r: Row): Student => ({
  id: r.id as number,
  classId: r.class_id as number,
  rollNo: r.roll_no as number,
  firstName: r.first_name as string,
  avatar: r.avatar as string,
  active: r.active === 1,
});

export const studentWithPinOf = (r: Row): StudentWithPin => ({ ...studentOf(r), pin: r.pin as string });

export const rosterStudentOf = (r: Row): RosterStudent => ({
  ...studentWithPinOf(r),
  firstLoginAt: (r.first_login_at as string | null) ?? null,
  lastLoginAt: (r.last_login_at as string | null) ?? null,
  locked: typeof r.locked_until === 'string' && Date.parse(r.locked_until) > Date.now(),
});

export async function getClassRow(db: Queryable, classId: number): Promise<Row> {
  const row = await db.get('SELECT * FROM classes WHERE id = ?', [classId]);
  if (!row) throw notFound('Class not found');
  return row;
}
