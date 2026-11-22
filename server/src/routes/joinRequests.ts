/**
 * Join requests: a child asks to join a class from the class link; the class teacher approves or removes the request.
 * Public endpoints return only the child's own request (guarded by a random secret); nothing about other students.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type {
  ApproveJoinRequestReq, CreateJoinRequestReq, CreateJoinRequestRes, JoinRequest, JoinRequestStatusRes, RosterStudent,
} from '@shabd/core';
import { avatarFor, generateClassPin, requireTeacher } from '../auth.ts';
import { getDb, isUniqueViolation } from '../db/db.ts';
import { HttpError, badRequest, notFound, type H } from '../http.ts';
import { rosterStudentOf } from '../mappers.ts';
import { audit } from '../services/audit.ts';
import { findJoinableClass } from '../services/join.ts';
import { clientKey, hit } from '../services/rateLimit.ts';
import { assertCanAccessClass, staffAuth } from '../tenancy.ts';
import { asObject, idParam, optInt, reqString } from '../validate.ts';

export const joinRequestsRouter = Router();

export const MAX_PENDING_PER_CLASS = 50;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** A first name: letters (any script), marks, and . ' - only. One word. No emoji, digits, symbols or sentences. */
export function cleanRequestName(raw: string): string {
  const name = raw.trim().normalize('NFC');
  if (/\s/.test(name)) throw badRequest('Type only your first name');
  if (!/^[\p{L}\p{M}][\p{L}\p{M}.'’-]*$/u.test(name)) throw badRequest('Use only letters in your name');
  return name;
}

const createRequest: H<{ classCode: string }, CreateJoinRequestRes, CreateJoinRequestReq> = async (req, res) => {
  await hit('join', clientKey(req));
  const b = asObject(req.body);
  const firstName = cleanRequestName(reqString(b, 'firstName', 1, 30));
  const rollNo = optInt(b, 'rollNo', 1, 9999);
  const db = getDb();
  const cls = await findJoinableClass(db, req.params.classCode);
  if (!cls) throw notFound('Class not found');
  const secret = randomBytes(16).toString('hex');
  const out = await db.tx(async (q) => {
    // serialise requests per class so the cap and the duplicate check cannot be raced
    await q.get('SELECT id FROM classes WHERE id = ? FOR UPDATE', [cls.id]);
    const pending = await q.all<{ first_name: string }>("SELECT first_name FROM join_requests WHERE class_id = ? AND status = 'pending'", [cls.id]);
    if (pending.some((p) => p.first_name.toLowerCase() === firstName.toLowerCase())) {
      throw new HttpError(409, 'conflict', 'Your teacher already has a request for that name. Please wait 🙂');
    }
    if (pending.length >= MAX_PENDING_PER_CLASS) throw new HttpError(409, 'conflict', 'Too many people are waiting. Ask your teacher.');
    const ins = await q.run(
      'INSERT INTO join_requests (class_id, first_name, requested_roll_no, secret_hash) VALUES (?, ?, ?, ?) RETURNING id',
      [cls.id, firstName, rollNo ?? null, sha(secret)],
    );
    return Number(ins.rows[0]!.id);
  });
  res.status(201).json({ requestId: out, secret });
};

const requestStatus: H<{ requestId: string }, JoinRequestStatusRes, unknown, { secret?: string }> = async (req, res) => {
  await hit('jreq', clientKey(req));
  const id = idParam(req.params.requestId);
  const secret = typeof req.query.secret === 'string' ? req.query.secret : '';
  const row = await getDb().get<{ first_name: string; status: 'pending' | 'approved' | 'rejected'; secret_hash: string }>(
    'SELECT first_name, status, secret_hash FROM join_requests WHERE id = ?', [id],
  );
  const given = Buffer.from(sha(secret));
  const want = Buffer.from(row?.secret_hash ?? sha('x'));
  if (!row || !timingSafeEqual(given, want)) throw notFound('Request not found');
  res.json({ status: row.status, firstName: row.first_name });
};

joinRequestsRouter.post('/join/class/:classCode/request', createRequest);
joinRequestsRouter.get('/join/request/:requestId', requestStatus);

// ---------------------------------------------------------------- teacher

const listRequests: H<{ classId: string }, JoinRequest[]> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(staffAuth(req), classId);
  const rows = await getDb().all<{ id: number; first_name: string; requested_roll_no: number | null; created_at: string }>(
    "SELECT id, first_name, requested_roll_no, created_at FROM join_requests WHERE class_id = ? AND status = 'pending' ORDER BY id",
    [classId],
  );
  res.json(rows.map((r) => ({ id: r.id, firstName: r.first_name, requestedRollNo: r.requested_roll_no, createdAt: r.created_at })));
};

const approve: H<{ classId: string; rid: string }, RosterStudent, ApproveJoinRequestReq> = async (req, res) => {
  const a = staffAuth(req);
  const classId = idParam(req.params.classId);
  const rid = idParam(req.params.rid);
  await assertCanAccessClass(a, classId);
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
  const chosen = optInt(b, 'rollNo', 1, 9999);
  try {
    const student = await getDb().tx(async (q) => {
      const r = await q.get<{ first_name: string; requested_roll_no: number | null; status: string }>(
        'SELECT first_name, requested_roll_no, status FROM join_requests WHERE id = ? AND class_id = ? FOR UPDATE', [rid, classId],
      );
      if (!r) throw notFound('Request not found');
      if (r.status !== 'pending') throw new HttpError(409, 'conflict', 'This request was already handled');
      let rollNo = chosen ?? r.requested_roll_no;
      if (rollNo === null || rollNo === undefined) {
        const m = await q.get<{ m: number | null }>('SELECT max(roll_no) AS m FROM students WHERE class_id = ?', [classId]);
        rollNo = Math.min(9999, Number(m?.m ?? 0) + 1);
      }
      if (await q.get('SELECT 1 FROM students WHERE class_id = ? AND roll_no = ?', [classId, rollNo])) {
        throw new HttpError(409, 'conflict', `Roll number ${rollNo} is already taken. Choose another number.`);
      }
      const ins = await q.run(
        'INSERT INTO students (class_id, roll_no, first_name, avatar, pin) VALUES (?, ?, ?, ?, ?) RETURNING *',
        [classId, rollNo, r.first_name, avatarFor(rollNo), await generateClassPin(q, classId)],
      );
      const row = ins.rows[0]!;
      await q.run(
        "UPDATE join_requests SET status = 'approved', decided_at = ?, decided_by_teacher_id = ?, student_id = ? WHERE id = ?",
        [new Date().toISOString(), a.teacherId, row.id, rid],
      );
      await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'join_request.approve', targetType: 'student', targetId: Number(row.id), meta: { requestId: rid, classId } });
      return rosterStudentOf(row);
    });
    res.status(201).json(student);
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, 'conflict', 'That roll number is already taken. Choose another number.');
    throw e;
  }
};

const reject: H<{ classId: string; rid: string }, { ok: true }> = async (req, res) => {
  const a = staffAuth(req);
  const classId = idParam(req.params.classId);
  const rid = idParam(req.params.rid);
  await assertCanAccessClass(a, classId);
  const db = getDb();
  await db.tx(async (q) => {
    const r = await q.get<{ status: string }>('SELECT status FROM join_requests WHERE id = ? AND class_id = ? FOR UPDATE', [rid, classId]);
    if (!r) throw notFound('Request not found');
    if (r.status !== 'pending') throw new HttpError(409, 'conflict', 'This request was already handled');
    await q.run("UPDATE join_requests SET status = 'rejected', decided_at = ?, decided_by_teacher_id = ? WHERE id = ?", [new Date().toISOString(), a.teacherId, rid]);
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'join_request.reject', targetType: 'class', targetId: classId, meta: { requestId: rid } });
  });
  res.json({ ok: true });
};

joinRequestsRouter.get('/classes/:classId/join-requests', requireTeacher, listRequests);
joinRequestsRouter.post('/classes/:classId/join-requests/:rid/approve', requireTeacher, approve);
joinRequestsRouter.post('/classes/:classId/join-requests/:rid/reject', requireTeacher, reject);
