/**
 * F8 endpoints: study results (JSON) and the anonymised research export (CSV). Staff only (teacher or school admin);
 * middleware is per route. Exports carry study codes only.
 */
import { Router } from 'express';
import type { ExportType, StudyResultsRes } from '@shabd/core';
import { EXPORT_TYPES } from '@shabd/core';
import { requireTeacher } from '../../auth.ts';
import { today } from '../../clock.ts';
import { getDb } from '../../db/db.ts';
import { badRequest, type H } from '../../http.ts';
import { audit } from '../../services/audit.ts';
import { buildExport, buildResults } from '../../services/research/results.ts';
import { assertStudyVisible } from '../../services/research/study.ts';
import { staffAuth } from '../../tenancy.ts';
import { idParam } from '../../validate.ts';

export const resultsRouter = Router();

const results: H<{ studyId: string }, StudyResultsRes> = async (req, res) => {
  const a = staffAuth(req);
  const studyId = idParam(req.params.studyId);
  const db = getDb();
  await assertStudyVisible(db, a, studyId);
  res.json(await buildResults(db, studyId));
};

const exportCsv: H<{ studyId: string }, string, unknown, { type?: string }> = async (req, res) => {
  const a = staffAuth(req);
  const studyId = idParam(req.params.studyId);
  const type = req.query.type as ExportType | undefined;
  if (!type || !(EXPORT_TYPES as readonly string[]).includes(type)) throw badRequest(`type must be one of ${EXPORT_TYPES.join(', ')}`);
  const db = getDb();
  await assertStudyVisible(db, a, studyId);
  const csv = buildExport(await buildResults(db, studyId), type);
  await audit(db, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'study.export', targetType: null, targetId: null, meta: { studyId, type } });
  res
    .status(200)
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="study-${studyId}-${type}-${today()}.csv"`)
    .send(csv);
};

resultsRouter.get('/studies/:studyId/results', requireTeacher, results);
resultsRouter.get('/studies/:studyId/export.csv', requireTeacher, exportCsv);
