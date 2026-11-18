/**
 * DB row -> API object mappers shared by routes.
 */
import type { ClassRoom, LeaderboardMode, Student, StudentWithPin, Teacher } from '@shabd/core';
import type { DB } from './db/db.ts';
import { notFound } from './http.ts';

type Row = Record<string, unknown>;

export const teacherOf = (r: Row): Teacher => ({ id: r.id as number, name: r.name as string, email: r.email as string });

export const classOf = (r: Row): ClassRoom => ({
  id: r.id as number,
  teacherId: r.teacher_id as number,
  name: r.name as string,
  classCode: r.class_code as string,
  startDate: r.start_date as string,
  leaderboardMode: r.leaderboard_mode as LeaderboardMode,
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

export function getClassRow(db: DB, classId: number): Row {
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId) as Row | undefined;
  if (!row) throw notFound('Class not found');
  return row;
}
