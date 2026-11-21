/** F5 teacher endpoints: flagged-sentence list and review. Signals only; nothing here changes scores. */
import { Router } from 'express';
import type { AuthenticityRes } from '@shabd/core';
import { requireTeacher } from '../../auth.ts';
import { getDb } from '../../db/db.ts';
import { badRequest, notFound, type H } from '../../http.ts';
import { audit } from '../../services/audit.ts';
import { classAuthenticity, reviewItem } from '../../services/research/authenticity.ts';
import { assertCanAccessClass, staffAuth } from '../../tenancy.ts';
import { asObject, idParam, optDate } from '../../validate.ts';

export const authenticityRouter = Router();

const get: H<{ classId: string }, AuthenticityRes> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(staffAuth(req), classId);
  const q = req.query as Record<string, unknown>;
  const from = optDate(q.from, 'from');
  const to = optDate(q.to, 'to');
  res.json(await classAuthenticity(getDb(), classId, from, to));
};

const patch: H<{ classId: string; kind: string; id: string }, { ok: true }> = async (req, res) => {
  const a = staffAuth(req);
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(a, classId);
  const { kind, id } = req.params;
  if (kind !== 'daily' && kind !== 'test') throw badRequest('kind must be daily or test');
  const o = asObject(req.body);
  if (o.status !== null && o.status !== 'ok' && o.status !== 'not_own') throw badRequest('status must be ok, not_own or null');
  const found = await reviewItem(getDb(), classId, kind, id, o.status, a.teacherId);
  if (!found) throw notFound('Sentence not found');
  await audit(getDb(), { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'authenticity.review', targetType: 'class', targetId: classId, meta: { kind, id, status: o.status } });
  res.json({ ok: true });
};

authenticityRouter.get('/classes/:classId/authenticity', requireTeacher, get);
authenticityRouter.patch('/classes/:classId/authenticity/:kind/:id', requireTeacher, patch);
