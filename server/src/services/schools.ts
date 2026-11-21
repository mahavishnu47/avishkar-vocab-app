/**
 * School-level services shared by the HTTP routes and the admin CLI. Contract: docs/ONBOARDING_SPEC.md 4.6, 4.7.
 */
import { randomInt } from 'node:crypto';
import { CODE_ALPHABET, schoolSetupText } from '@shabd/core';
import type { AdminSchoolRow, ClassSummary, CreateSchoolRes, InviteWithText, School } from '@shabd/core';
import { classOf } from '../mappers.ts';
import { isUniqueViolation, type Queryable, type Row } from '../db/db.ts';
import { HttpError, badRequest, notFound } from '../http.ts';
import { audit } from './audit.ts';
import { DAY_MS, createInvite, inviteOf, withText } from './invites.ts';

export const SETUP_LINK_DAYS = 14;

export const schoolOf = (r: Row): School => ({
  id: r.id as number,
  name: r.name as string,
  district: r.district as string,
  studentCode: r.student_code as string,
  status: r.status as 'active' | 'suspended',
});

export function generateStudentCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Insert a school with a fresh unique student code. */
export async function insertSchool(q: Queryable, name: string, district: string, udise: string | null): Promise<Row> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const r = await q.run('INSERT INTO schools (name, district, udise_code, student_code) VALUES (?, ?, ?, ?) RETURNING *', [
        name, district, udise, generateStudentCode(),
      ]);
      return r.rows[0]!;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new HttpError(500, 'internal', 'Could not generate a school code');
}

export function validateSchoolInput(name: unknown, district: unknown, udise: unknown): { name: string; district: string; udise: string | null } {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) throw badRequest('name must be 1-100 characters');
  if (district !== undefined && (typeof district !== 'string' || district.trim().length > 60)) throw badRequest('district must be at most 60 characters');
  if (udise !== undefined && udise !== null && udise !== '' && (typeof udise !== 'string' || !/^\d{11}$/.test(udise))) {
    throw badRequest('udiseCode must be 11 digits');
  }
  return { name: name.trim(), district: typeof district === 'string' ? district.trim() : '', udise: typeof udise === 'string' && udise !== '' ? udise : null };
}

/** Create a school plus its 14-day single-use setup invite (super admin / CLI). */
export async function createSchool(q: Queryable, input: { name: string; district: string; udise: string | null }, base: string): Promise<CreateSchoolRes> {
  return q.tx(async (t) => {
    const school = await insertSchool(t, input.name, input.district, input.udise);
    const inv = await createInvite(t, { kind: 'school_admin', schoolId: school.id as number, maxUses: 1, ttlMs: SETUP_LINK_DAYS * DAY_MS });
    await audit(t, { schoolId: school.id as number, actorType: 'super', action: 'school.create', targetType: 'school', targetId: school.id as number });
    await audit(t, { schoolId: school.id as number, actorType: 'super', action: 'invite.create', targetType: 'invite', targetId: inv.id as number, meta: { kind: 'school_admin' } });
    const invite = withText(inviteOf(inv, base), school.name as string);
    return { school: schoolOf(school), setupInvite: invite, whatsappText: invite.whatsappText };
  });
}

/** A fresh single-use setup link for an existing school (lost link, or a second admin). */
export async function createSetupLink(q: Queryable, schoolId: number, base: string): Promise<InviteWithText> {
  const school = await q.get('SELECT * FROM schools WHERE id = ?', [schoolId]);
  if (!school) throw notFound('School not found');
  const inv = await createInvite(q, { kind: 'school_admin', schoolId, maxUses: 1, ttlMs: SETUP_LINK_DAYS * DAY_MS });
  await audit(q, { schoolId, actorType: 'super', action: 'invite.create', targetType: 'invite', targetId: inv.id as number, meta: { kind: 'school_admin' } });
  const out = withText(inviteOf(inv, base), school.name as string);
  return { ...out, whatsappText: schoolSetupText({ schoolName: school.name as string, url: out.url, expiresAt: out.expiresAt }) };
}

const ADMIN_ROW_SQL = `
  SELECT s.*,
    (SELECT count(*) FROM teachers t WHERE t.school_id = s.id AND t.active = 1) AS teachers,
    (SELECT count(*) FROM classes c WHERE c.school_id = s.id AND c.archived = 0) AS classes,
    (SELECT count(*) FROM students st JOIN classes c ON c.id = st.class_id WHERE c.school_id = s.id AND st.active = 1) AS students
  FROM schools s`;

const adminRowOf = (r: Row): AdminSchoolRow => ({
  school: schoolOf(r),
  udiseCode: (r.udise_code as string | null) ?? null,
  teachers: Number(r.teachers), classes: Number(r.classes), students: Number(r.students),
  createdAt: r.created_at as string,
});

export async function listSchools(q: Queryable): Promise<AdminSchoolRow[]> {
  return (await q.all(`${ADMIN_ROW_SQL} ORDER BY s.id DESC`)).map(adminRowOf);
}

export async function getAdminSchool(q: Queryable, id: number): Promise<AdminSchoolRow> {
  const r = await q.get(`${ADMIN_ROW_SQL} WHERE s.id = ?`, [id]);
  if (!r) throw notFound('School not found');
  return adminRowOf(r);
}

/** Delete every token of every teacher and student in a school. */
export async function revokeSchoolTokens(q: Queryable, schoolId: number): Promise<void> {
  await q.run('DELETE FROM auth_tokens WHERE teacher_id IN (SELECT id FROM teachers WHERE school_id = ?)', [schoolId]);
  await q.run('DELETE FROM auth_tokens WHERE student_id IN (SELECT st.id FROM students st JOIN classes c ON c.id = st.class_id WHERE c.school_id = ?)', [schoolId]);
}

export async function updateSchoolAsAdmin(q: Queryable, id: number, patch: { name?: string; district?: string; status?: 'active' | 'suspended' }): Promise<AdminSchoolRow> {
  await q.tx(async (t) => {
    const cur = await t.get('SELECT * FROM schools WHERE id = ? FOR UPDATE', [id]);
    if (!cur) throw notFound('School not found');
    await t.run('UPDATE schools SET name = COALESCE(?, name), district = COALESCE(?, district), status = COALESCE(?, status) WHERE id = ?', [
      patch.name ?? null, patch.district ?? null, patch.status ?? null, id,
    ]);
    if (patch.name !== undefined || patch.district !== undefined) {
      await audit(t, { schoolId: id, actorType: 'super', action: 'school.update', targetType: 'school', targetId: id });
    }
    if (patch.status !== undefined && patch.status !== cur.status) {
      await audit(t, { schoolId: id, actorType: 'super', action: patch.status === 'suspended' ? 'school.suspend' : 'school.resume', targetType: 'school', targetId: id });
      if (patch.status === 'suspended') await revokeSchoolTokens(t, id);
    }
  });
  return getAdminSchool(q, id);
}

// ---------------------------------------------------------------- class summaries (teacher overview, school classes)

/** ClassSummary rows for the given WHERE clause over `classes c` (params follow the date param). */
export async function classSummaries(q: Queryable, date: string, where: string, params: unknown[]): Promise<ClassSummary[]> {
  const rows = await q.all(
    `SELECT c.*, t.name AS teacher_name,
       (SELECT count(*) FROM students s WHERE s.class_id = c.id AND s.active = 1) AS student_count,
       (SELECT count(*) FROM students s WHERE s.class_id = c.id AND s.active = 1 AND s.first_login_at IS NOT NULL) AS joined_count,
       (SELECT count(*) FROM sessions se JOIN students s ON s.id = se.student_id AND s.active = 1
         WHERE se.class_id = c.id AND se.date = ? AND se.completed_at IS NOT NULL) AS completed_today
     FROM classes c JOIN teachers t ON t.id = c.teacher_id
     WHERE ${where} ORDER BY c.standard, c.division, c.id`,
    [date, ...params],
  );
  return rows.map((r) => ({
    ...classOf(r), teacherName: r.teacher_name as string,
    studentCount: Number(r.student_count), joinedCount: Number(r.joined_count), completedToday: Number(r.completed_today),
  }));
}

/** 409 when a non-archived class with the same standard + division + academic year exists in the school. */
export async function assertClassSlotFree(
  q: Queryable, schoolId: number, standard: number, division: string, year: string, exceptClassId?: number,
): Promise<void> {
  const dup = await q.get(
    'SELECT 1 FROM classes WHERE school_id = ? AND standard = ? AND division = ? AND academic_year = ? AND archived = 0 AND id <> ?',
    [schoolId, standard, division, year, exceptClassId ?? 0],
  );
  if (dup) throw new HttpError(409, 'conflict', `Class ${standard}${division} already exists in your school. Ask your school admin.`);
}
