/**
 * Super admin endpoints (X-Admin-Secret header, off when SUPER_ADMIN_SECRET is unset). Contract: docs/ONBOARDING_SPEC.md 4.7.
 */
import { Router } from 'express';
import { getOverview, getSchoolDetail, listActivity } from '../services/adminStats.ts';
import type { AdminActivityEntry, AdminOverview, AdminSchoolDetail, AdminSchoolRow, AdminUpdateSchoolReq, CreateSchoolReq, CreateSchoolRes, InviteWithText } from '@shabd/core';
import { getDb } from '../db/db.ts';
import { badRequest, type H } from '../http.ts';
import { baseUrl } from '../services/invites.ts';
import { createSchool, createSetupLink, getAdminSchool, listSchools, updateSchoolAsAdmin, validateSchoolInput } from '../services/schools.ts';
import { requireSuperAdmin } from '../tenancy.ts';
import { asObject, idParam } from '../validate.ts';

export const adminRouter = Router();
adminRouter.use('/admin', requireSuperAdmin);

const list: H<{}, AdminSchoolRow[]> = async (_req, res) => {
  res.json(await listSchools(getDb()));
};

const create: H<{}, CreateSchoolRes, CreateSchoolReq> = async (req, res) => {
  const b = asObject(req.body);
  const v = validateSchoolInput(b.name, b.district, b.udiseCode);
  res.status(201).json(await createSchool(getDb(), v, baseUrl(req)));
};

const setupLink: H<{ schoolId: string }, InviteWithText> = async (req, res) => {
  res.status(201).json(await createSetupLink(getDb(), idParam(req.params.schoolId), baseUrl(req)));
};

const patch: H<{ schoolId: string }, AdminSchoolRow, AdminUpdateSchoolReq> = async (req, res) => {
  const id = idParam(req.params.schoolId);
  const b = asObject(req.body);
  const patchBody: { name?: string; district?: string; status?: 'active' | 'suspended' } = {};
  if (b.name !== undefined) patchBody.name = validateSchoolInput(b.name, undefined, undefined).name;
  if (b.district !== undefined) patchBody.district = validateSchoolInput('x', b.district, undefined).district;
  if (b.status !== undefined) {
    if (b.status !== 'active' && b.status !== 'suspended') throw badRequest("status must be 'active' or 'suspended'");
    patchBody.status = b.status;
  }
  await getAdminSchool(getDb(), id); // 404 first
  res.json(await updateSchoolAsAdmin(getDb(), id, patchBody));
};

const overview: H<{}, AdminOverview> = async (_req, res) => {
  res.json(await getOverview(getDb()));
};
const detail: H<{ schoolId: string }, AdminSchoolDetail> = async (req, res) => {
  res.json(await getSchoolDetail(getDb(), idParam(req.params.schoolId)));
};
const activity: H<{}, AdminActivityEntry[]> = async (req, res) => {
  const raw = Number(req.query.limit ?? 50);
  const limit = Number.isInteger(raw) && raw >= 1 ? Math.min(raw, 200) : 50;
  res.json(await listActivity(getDb(), limit));
};

adminRouter.get('/admin/overview', overview);
adminRouter.get('/admin/activity', activity);
adminRouter.get('/admin/schools/:schoolId', detail);
adminRouter.get('/admin/schools', list);
adminRouter.post('/admin/schools', create);
adminRouter.post('/admin/schools/:schoolId/setup-link', setupLink);
adminRouter.patch('/admin/schools/:schoolId', patch);
