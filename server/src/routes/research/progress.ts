/** F7 teacher endpoint: vocabulary progress and participation record. Read-only. */
import { Router } from 'express';
import type { ProgressRes } from '@shabd/core';
import { requireTeacher } from '../../auth.ts';
import { getDb } from '../../db/db.ts';
import { badRequest, type H } from '../../http.ts';
import { classProgress } from '../../services/research/progress.ts';
import { assertCanAccessClass, staffAuth } from '../../tenancy.ts';
import { idParam, optDate } from '../../validate.ts';

export const progressRouter = Router();

const get: H<{ classId: string }, ProgressRes> = async (req, res) => {
  const classId = idParam(req.params.classId);
  await assertCanAccessClass(staffAuth(req), classId);
  const q = req.query as Record<string, unknown>;
  const from = optDate(q.from, 'from');
  const to = optDate(q.to, 'to');
  if (from && to && from > to) throw badRequest('from must be on or before to');
  res.json(await classProgress(getDb(), classId, from, to));
};

progressRouter.get('/classes/:classId/progress', requireTeacher, get);
