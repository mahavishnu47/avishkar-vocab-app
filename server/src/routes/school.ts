/**
 * School admin endpoints. Always scoped to the caller's school (no school id in any URL); another school's
 * ids are 404. Contract: docs/ONBOARDING_SPEC.md 4.6.
 */
import { Router } from 'express';
import type {
  AuditEntry, ClassSummary, CreateInviteReq, Invite, InviteWithText, SchoolInfoRes, SchoolOverviewRes, SchoolTeacherRow,
  UpdateMySchoolReq, UpdateSchoolClassReq, UpdateSchoolTeacherReq,
} from '@shabd/core';
import { schoolJoinPath, weekStart } from '@shabd/core';
import { today } from '../clock.ts';
import { getDb, isUniqueViolation, type Queryable } from '../db/db.ts';
import { HttpError, badRequest, notFound, type H } from '../http.ts';
import { audit } from '../services/audit.ts';
import { DAY_MS, DEFAULT_TEACHER_INVITE_USES, baseUrl, createInvite, inviteOf, liveTeacherInvite, withText } from '../services/invites.ts';
import { assertClassSlotFree, classSummaries, generateStudentCode, schoolOf } from '../services/schools.ts';
import { requireSchoolAdmin, staffAuth } from '../tenancy.ts';
import { asObject, idParam, optDate, optInt, optString } from '../validate.ts';

export const schoolRouter = Router();
schoolRouter.use('/school', requireSchoolAdmin);

async function schoolInfo(q: Queryable, schoolId: number, base: string): Promise<SchoolInfoRes> {
  const row = (await q.get('SELECT * FROM schools WHERE id = ?', [schoolId]))!;
  const inv = await liveTeacherInvite(q, schoolId);
  const c = (await q.get<{ teachers: number; plain: number; classes: number; played: number }>(
    `SELECT (SELECT count(*) FROM teachers WHERE school_id = ?) AS teachers,
            (SELECT count(*) FROM teachers WHERE school_id = ? AND role = 'teacher') AS plain,
            (SELECT count(*) FROM classes WHERE school_id = ?) AS classes,
            (SELECT count(*) FROM sessions se JOIN classes cl ON cl.id = se.class_id WHERE cl.school_id = ?) AS played`,
    [schoolId, schoolId, schoolId, schoolId],
  ))!;
  const checklist = {
    teacherLinkShared: row.teacher_link_shared_at !== null,
    firstTeacherJoined: Number(c.teachers) >= 2 || Number(c.plain) >= 1,
    firstClassCreated: Number(c.classes) > 0,
    firstStudentPlayed: Number(c.played) > 0,
    done: false,
  };
  checklist.done = checklist.teacherLinkShared && checklist.firstTeacherJoined && checklist.firstClassCreated && checklist.firstStudentPlayed;
  return {
    school: schoolOf(row),
    studentJoinUrl: `${base}${schoolJoinPath(row.student_code as string)}`,
    teacherInvite: inv ? inviteOf(inv, base) : null,
    checklist,
  };
}

const getSchool: H<{}, SchoolInfoRes> = async (req, res) => {
  res.json(await schoolInfo(getDb(), staffAuth(req).schoolId, baseUrl(req)));
};

const patchSchool: H<{}, SchoolInfoRes, UpdateMySchoolReq> = async (req, res) => {
  const a = staffAuth(req);
  const b = asObject(req.body);
  const name = optString(b, 'name', 1, 100);
  if (b.district !== undefined && (typeof b.district !== 'string' || b.district.trim().length > 60)) throw badRequest('district must be at most 60 characters');
  const district = typeof b.district === 'string' ? b.district.trim() : undefined;
  if (b.teacherLinkShared !== undefined && b.teacherLinkShared !== true) throw badRequest('teacherLinkShared must be true');
  const db = getDb();
  await db.tx(async (q) => {
    await q.run(
      `UPDATE schools SET name = COALESCE(?, name), district = COALESCE(?, district),
              teacher_link_shared_at = CASE WHEN ? THEN COALESCE(teacher_link_shared_at, ?) ELSE teacher_link_shared_at END WHERE id = ?`,
      [name ?? null, district ?? null, b.teacherLinkShared === true, new Date().toISOString(), a.schoolId],
    );
    if (name !== undefined || district !== undefined) {
      await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'school.update', targetType: 'school', targetId: a.schoolId });
    }
  });
  res.json(await schoolInfo(db, a.schoolId, baseUrl(req)));
};

const rotateStudentCode: H<{}, SchoolInfoRes> = async (req, res) => {
  const a = staffAuth(req);
  const db = getDb();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await db.run('UPDATE schools SET student_code = ? WHERE id = ?', [generateStudentCode(), a.schoolId]);
      await audit(db, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'school.student_code_rotate', targetType: 'school', targetId: a.schoolId });
      res.json(await schoolInfo(db, a.schoolId, baseUrl(req)));
      return;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new HttpError(500, 'internal', 'Could not generate a school code');
};

/** Weekdays (Mon-Fri) from Monday of the week up to `date`, at most 5. */
function weekdaysThrough(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 5 : Math.min(dow, 5);
}

const overview: H<{}, SchoolOverviewRes, unknown, { date?: string }> = async (req, res) => {
  const a = staffAuth(req);
  const date = optDate(req.query.date, 'date') ?? today();
  const db = getDb();
  const rows = await classSummaries(db, date, 'c.school_id = ? AND c.archived = 0', [a.schoolId]);
  const wkStart = weekStart(date);
  const wk = await db.all<{ class_id: number; n: number }>(
    `SELECT se.class_id, count(*) AS n FROM sessions se
       JOIN students s ON s.id = se.student_id AND s.active = 1
       JOIN classes c ON c.id = se.class_id
      WHERE c.school_id = ? AND c.archived = 0 AND se.completed_at IS NOT NULL AND se.date >= ? AND se.date <= ?
      GROUP BY se.class_id`,
    [a.schoolId, wkStart, date],
  );
  const wkMap = new Map(wk.map((r) => [r.class_id, Number(r.n)]));
  const days = weekdaysThrough(date);
  const teachers = Number((await db.get<{ n: number }>('SELECT count(*) AS n FROM teachers WHERE school_id = ? AND active = 1', [a.schoolId]))!.n);
  const classes = rows.map((c) => {
    const denom = c.studentCount * days;
    return {
      classId: c.id, name: c.name, standard: c.standard, division: c.division, teacherId: c.teacherId, teacherName: c.teacherName,
      teacherActive: false, studentCount: c.studentCount, joinedCount: c.joinedCount, completedToday: c.completedToday,
      weekCompletionPct: denom === 0 ? 0 : Math.min(100, Math.round(((wkMap.get(c.id) ?? 0) / denom) * 100)),
      archived: c.archived, joinEnabled: c.joinEnabled,
    };
  });
  const activeTeachers = new Set(
    (await db.all<{ id: number }>('SELECT id FROM teachers WHERE school_id = ? AND active = 1', [a.schoolId])).map((t) => t.id),
  );
  for (const c of classes) c.teacherActive = activeTeachers.has(c.teacherId);
  res.json({
    date,
    totals: {
      teachers, classes: classes.length,
      students: rows.reduce((n, c) => n + c.studentCount, 0),
      joined: rows.reduce((n, c) => n + c.joinedCount, 0),
      completedToday: rows.reduce((n, c) => n + c.completedToday, 0),
    },
    classes,
  });
};

async function teacherRow(q: Queryable, schoolId: number, id: number): Promise<SchoolTeacherRow> {
  const r = await q.get(
    `SELECT t.*, (SELECT count(*) FROM classes c WHERE c.teacher_id = t.id AND c.archived = 0) AS class_count
       FROM teachers t WHERE t.id = ? AND t.school_id = ?`,
    [id, schoolId],
  );
  if (!r) throw notFound('Teacher not found');
  return {
    id: r.id as number, name: r.name as string, email: r.email as string, role: r.role as 'teacher' | 'school_admin',
    active: r.active === 1, classCount: Number(r.class_count), lastLoginAt: (r.last_login_at as string | null) ?? null,
  };
}

const listTeachers: H<{}, SchoolTeacherRow[]> = async (req, res) => {
  const a = staffAuth(req);
  const rows = await getDb().all(
    `SELECT t.id FROM teachers t WHERE t.school_id = ? ORDER BY (t.role = 'school_admin') DESC, lower(t.name), t.id`,
    [a.schoolId],
  );
  const db = getDb();
  res.json(await Promise.all(rows.map((r) => teacherRow(db, a.schoolId, r.id as number))));
};

const patchTeacher: H<{ teacherId: string }, SchoolTeacherRow, UpdateSchoolTeacherReq> = async (req, res) => {
  const a = staffAuth(req);
  const id = idParam(req.params.teacherId);
  const b = asObject(req.body);
  if (b.active !== undefined && typeof b.active !== 'boolean') throw badRequest('active must be true or false');
  if (b.role !== undefined && b.role !== 'teacher' && b.role !== 'school_admin') throw badRequest("role must be 'teacher' or 'school_admin'");
  const db = getDb();
  await db.tx(async (q) => {
    await q.run('SELECT id FROM schools WHERE id = ? FOR UPDATE', [a.schoolId]); // serialises last-admin checks
    const cur = await q.get('SELECT * FROM teachers WHERE id = ? AND school_id = ?', [id, a.schoolId]);
    if (!cur) throw notFound('Teacher not found');
    const newActive = b.active === undefined ? cur.active === 1 : b.active;
    const newRole = (b.role ?? cur.role) as string;
    const wasAdmin = cur.active === 1 && cur.role === 'school_admin';
    const willBeAdmin = newActive && newRole === 'school_admin';
    if (wasAdmin && !willBeAdmin) {
      const others = Number((await q.get<{ n: number }>(
        "SELECT count(*) AS n FROM teachers WHERE school_id = ? AND active = 1 AND role = 'school_admin' AND id <> ?", [a.schoolId, id],
      ))!.n);
      if (others === 0) throw new HttpError(409, 'conflict', 'Your school needs at least one admin.');
    }
    await q.run('UPDATE teachers SET active = ?, role = ? WHERE id = ?', [newActive ? 1 : 0, newRole, id]);
    const actor = { schoolId: a.schoolId, actorType: 'teacher' as const, actorId: a.teacherId, targetType: 'teacher' as const, targetId: id };
    if (newActive !== (cur.active === 1)) {
      await audit(q, { ...actor, action: newActive ? 'teacher.activate' : 'teacher.deactivate' });
      if (!newActive) await q.run('DELETE FROM auth_tokens WHERE teacher_id = ?', [id]);
    }
    if (newRole !== cur.role) {
      await audit(q, { ...actor, action: 'teacher.role_change', meta: { role: newRole } });
    }
  });
  res.json(await teacherRow(db, a.schoolId, id));
};

const resetLink: H<{ teacherId: string }, InviteWithText> = async (req, res) => {
  const a = staffAuth(req);
  const id = idParam(req.params.teacherId);
  const db = getDb();
  const t = await db.get<{ id: number; name: string }>('SELECT id, name FROM teachers WHERE id = ? AND school_id = ?', [id, a.schoolId]);
  if (!t) throw notFound('Teacher not found');
  if (t.id === a.teacherId) throw badRequest('You cannot make a reset link for yourself. Ask WordWise for a new setup link.');
  const out = await db.tx(async (q) => {
    await q.run(
      "UPDATE invites SET revoked_at = ? WHERE kind = 'password_reset' AND teacher_id = ? AND revoked_at IS NULL AND use_count = 0",
      [new Date().toISOString(), id],
    );
    const inv = await createInvite(q, { kind: 'password_reset', schoolId: a.schoolId, teacherId: id, createdByTeacherId: a.teacherId, maxUses: 1, ttlMs: DAY_MS });
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'invite.create', targetType: 'invite', targetId: inv.id as number, meta: { kind: 'password_reset', teacherId: id } });
    return inv;
  });
  res.status(201).json(withText(inviteOf(out, baseUrl(req)), '', { teacherName: t.name }));
};

const listInvites: H<{}, Invite[]> = async (req, res) => {
  const rows = await getDb().all("SELECT * FROM invites WHERE school_id = ? AND kind = 'teacher' ORDER BY id DESC", [staffAuth(req).schoolId]);
  const base = baseUrl(req);
  res.json(rows.map((r) => inviteOf(r, base)));
};

const createTeacherInvite: H<{}, InviteWithText, CreateInviteReq> = async (req, res) => {
  const a = staffAuth(req);
  const b = req.body === undefined || req.body === null ? {} : asObject(req.body);
  const days = optInt(b, 'expiresInDays', 1, 90) ?? 30;
  let maxUses: number | null = DEFAULT_TEACHER_INVITE_USES; // a leaked staff-group link must not let strangers in forever (T-6)
  if (b.maxUses !== undefined && b.maxUses !== null) maxUses = optInt(b, 'maxUses', 1, 500)!;
  const db = getDb();
  const inv = await db.tx(async (q) => {
    const old = await q.all<{ id: number }>(
      "UPDATE invites SET revoked_at = ? WHERE school_id = ? AND kind = 'teacher' AND revoked_at IS NULL RETURNING id",
      [new Date().toISOString(), a.schoolId],
    );
    for (const o of old) await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'invite.revoke', targetType: 'invite', targetId: o.id });
    const created = await createInvite(q, { kind: 'teacher', schoolId: a.schoolId, createdByTeacherId: a.teacherId, maxUses, ttlMs: days * DAY_MS });
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'invite.create', targetType: 'invite', targetId: created.id as number, meta: { kind: 'teacher' } });
    return created;
  });
  const name = (await db.get<{ name: string }>('SELECT name FROM schools WHERE id = ?', [a.schoolId]))!.name;
  res.status(201).json(withText(inviteOf(inv, baseUrl(req)), name));
};

const revokeInvite: H<{ inviteId: string }, void> = async (req, res) => {
  const a = staffAuth(req);
  const id = idParam(req.params.inviteId);
  const db = getDb();
  const inv = await db.get("SELECT id, revoked_at FROM invites WHERE id = ? AND school_id = ? AND kind = 'teacher'", [id, a.schoolId]);
  if (!inv) throw notFound('Invite not found');
  if (inv.revoked_at === null) {
    await db.tx(async (q) => {
      await q.run('UPDATE invites SET revoked_at = ? WHERE id = ?', [new Date().toISOString(), id]);
      await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'invite.revoke', targetType: 'invite', targetId: id });
    });
  }
  res.status(204).end();
};

const listClasses: H<{}, ClassSummary[], unknown, { archived?: string }> = async (req, res) => {
  res.json(await classSummaries(getDb(), today(), `c.school_id = ? ${req.query.archived === '1' ? '' : 'AND c.archived = 0'}`, [staffAuth(req).schoolId]));
};

const patchClass: H<{ classId: string }, ClassSummary, UpdateSchoolClassReq> = async (req, res) => {
  const a = staffAuth(req);
  const id = idParam(req.params.classId);
  const b = asObject(req.body);
  const teacherId = optInt(b, 'teacherId', 1);
  if (b.archived !== undefined && typeof b.archived !== 'boolean') throw badRequest('archived must be true or false');
  const db = getDb();
  await db.tx(async (q) => {
    const cur = await q.get('SELECT * FROM classes WHERE id = ? AND school_id = ? FOR UPDATE', [id, a.schoolId]);
    if (!cur) throw notFound('Class not found');
    if (teacherId !== undefined) {
      const t = await q.get('SELECT 1 FROM teachers WHERE id = ? AND school_id = ? AND active = 1', [teacherId, a.schoolId]);
      if (!t) throw badRequest('teacherId must be an active teacher of your school');
    }
    if (b.archived === false && cur.archived === 1) {
      await assertClassSlotFree(q, a.schoolId, cur.standard as number, cur.division as string, cur.academic_year as string, id);
    }
    await q.run('UPDATE classes SET teacher_id = COALESCE(?, teacher_id), archived = COALESCE(?, archived) WHERE id = ?', [
      teacherId ?? null, b.archived === undefined ? null : b.archived ? 1 : 0, id,
    ]);
    const actor = { schoolId: a.schoolId, actorType: 'teacher' as const, actorId: a.teacherId, targetType: 'class' as const, targetId: id };
    if (teacherId !== undefined && teacherId !== cur.teacher_id) await audit(q, { ...actor, action: 'class.reassign', meta: { teacherId } });
    if (b.archived === true && cur.archived === 0) await audit(q, { ...actor, action: 'class.archive' });
  });
  res.json((await classSummaries(db, today(), 'c.id = ? AND c.school_id = ?', [id, a.schoolId]))[0]!);
};

const auditLog: H<{}, AuditEntry[], unknown, { limit?: string; before?: string }> = async (req, res) => {
  const a = staffAuth(req);
  const limitN = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(limitN) || limitN < 1 || limitN > 200) throw badRequest('limit must be 1-200');
  const before = req.query.before === undefined ? null : Number(req.query.before);
  if (before !== null && (!Number.isInteger(before) || before < 1 || before > 2_147_483_647)) throw badRequest('before must be an id');
  const rows = await getDb().all(
    `SELECT l.*,
        CASE l.actor_type WHEN 'teacher' THEN (SELECT name FROM teachers WHERE id = l.actor_id)
                          WHEN 'student' THEN (SELECT first_name FROM students WHERE id = l.actor_id) END AS actor_name,
        CASE l.target_type
          WHEN 'teacher' THEN (SELECT name FROM teachers WHERE id = l.target_id)
          WHEN 'class' THEN (SELECT name FROM classes WHERE id = l.target_id)
          WHEN 'school' THEN (SELECT name FROM schools WHERE id = l.target_id)
          WHEN 'student' THEN (SELECT first_name || ' (' || roll_no || ')' FROM students WHERE id = l.target_id) END AS target_label
       FROM audit_log l WHERE l.school_id = ? AND (?::int IS NULL OR l.id < ?::int) ORDER BY l.id DESC LIMIT ?`,
    [a.schoolId, before, before, limitN],
  );
  res.json(rows.map((r) => ({
    id: r.id as number, at: r.created_at as string, actorType: r.actor_type as AuditEntry['actorType'],
    actorName: (r.actor_name as string | null) ?? null, action: r.action as string,
    targetType: (r.target_type as string | null) ?? null, targetId: (r.target_id as number | null) ?? null,
    targetLabel: (r.target_label as string | null) ?? null, meta: JSON.parse(r.meta_json as string) as Record<string, unknown>,
  })));
};

schoolRouter.get('/school', getSchool);
schoolRouter.patch('/school', patchSchool);
schoolRouter.post('/school/rotate-student-code', rotateStudentCode);
schoolRouter.get('/school/overview', overview);
schoolRouter.get('/school/teachers', listTeachers);
schoolRouter.patch('/school/teachers/:teacherId', patchTeacher);
schoolRouter.post('/school/teachers/:teacherId/reset-link', resetLink);
schoolRouter.get('/school/invites', listInvites);
schoolRouter.post('/school/invites', createTeacherInvite);
schoolRouter.delete('/school/invites/:inviteId', revokeInvite);
schoolRouter.get('/school/classes', listClasses);
schoolRouter.patch('/school/classes/:classId', patchClass);
schoolRouter.get('/school/audit', auditLog);
