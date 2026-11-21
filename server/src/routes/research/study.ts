/**
 * F1 endpoints: studies, attached classes, participants (study codes + consent), withdrawal.
 * Staff only. Middleware is per route: a path-less router.use() here would run for every /api request.
 */
import { Router } from 'express';
import type {
  ConsentStatus, CreateStudyReq, SetStudyClassReq, Study, StudyGroup, StudyParticipant, StudyStatus, UpdateParticipantReq, UpdateStudyReq,
} from '@shabd/core';
import { CONSENT_STATUSES, DEFAULT_SCHOOL_DAYS, DEFAULT_WORDS_PER_DAY, STUDY_GROUPS, STUDY_STATUSES } from '@shabd/core';
import { requireTeacher } from '../../auth.ts';
import { today } from '../../clock.ts';
import { badRequest, type H } from '../../http.ts';
import {
  attachClass, createStudy, detachClass, getStudy, listParticipants, listStudies, updateParticipant,
  updateStudy, withdrawParticipant,
} from '../../services/research/study.ts';
import { staffAuth } from '../../tenancy.ts';
import { asObject, idParam, optDate, optInt, optString, reqString } from '../../validate.ts';

export const studyRouter = Router();

function group(v: unknown): StudyGroup {
  if (typeof v !== 'string' || !(STUDY_GROUPS as readonly string[]).includes(v)) throw badRequest('group must be intervention or comparison');
  return v as StudyGroup;
}

const list: H<{}, Study[]> = async (req, res) => {
  res.json(await listStudies(staffAuth(req)));
};

const create: H<{}, Study, CreateStudyReq> = async (req, res) => {
  const a = staffAuth(req);
  const b = asObject(req.body);
  const classesIn = b.classes === undefined ? [] : b.classes;
  if (!Array.isArray(classesIn) || classesIn.length > 10) throw badRequest('classes must be a list of up to 10 classes');
  const classes = classesIn.map((c) => {
    const o = asObject(c);
    const classId = optInt(o, 'classId', 1, 2_147_483_647);
    if (classId === undefined) throw badRequest('classId is required');
    return { classId, group: group(o.group) };
  });
  const study = await createStudy(a, {
    name: reqString(b, 'name', 1, 80),
    startDate: optDate(b.startDate, 'startDate') ?? today(),
    schoolDays: optInt(b, 'schoolDays', 1, 60) ?? DEFAULT_SCHOOL_DAYS,
    wordsPerDay: optInt(b, 'wordsPerDay', 1, 20) ?? DEFAULT_WORDS_PER_DAY,
    classes,
  });
  res.status(201).json(study);
};

const get: H<{ studyId: string }, Study> = async (req, res) => {
  res.json(await getStudy(staffAuth(req), idParam(req.params.studyId)));
};

const patch: H<{ studyId: string }, Study, UpdateStudyReq> = async (req, res) => {
  const a = staffAuth(req);
  const studyId = idParam(req.params.studyId);
  const b = asObject(req.body);
  let status: StudyStatus | undefined;
  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !(STUDY_STATUSES as readonly string[]).includes(b.status)) throw badRequest('status must be setup, running or closed');
    status = b.status as StudyStatus;
  }
  res.json(await updateStudy(a, studyId, {
    name: optString(b, 'name', 1, 80),
    startDate: optDate(b.startDate, 'startDate'),
    schoolDays: optInt(b, 'schoolDays', 1, 60),
    wordsPerDay: optInt(b, 'wordsPerDay', 1, 20),
    status,
  }));
};

const putClass: H<{ studyId: string; classId: string }, Study, SetStudyClassReq> = async (req, res) => {
  const a = staffAuth(req);
  res.json(await attachClass(a, idParam(req.params.studyId), idParam(req.params.classId), group(asObject(req.body).group)));
};

const deleteClass: H<{ studyId: string; classId: string }, Study> = async (req, res) => {
  res.json(await detachClass(staffAuth(req), idParam(req.params.studyId), idParam(req.params.classId)));
};

const participants: H<{ studyId: string }, StudyParticipant[]> = async (req, res) => {
  res.json(await listParticipants(staffAuth(req), idParam(req.params.studyId)));
};

const patchParticipant: H<{ studyId: string; studentId: string }, StudyParticipant, UpdateParticipantReq> = async (req, res) => {
  const a = staffAuth(req);
  const studyId = idParam(req.params.studyId);
  const studentId = idParam(req.params.studentId);
  const b = asObject(req.body);
  let consent: ConsentStatus | undefined;
  if (b.consent !== undefined) {
    if (typeof b.consent !== 'string' || !(CONSENT_STATUSES as readonly string[]).includes(b.consent)) throw badRequest('consent must be pending, given, declined or withdrawn');
    consent = b.consent as ConsentStatus;
  }
  if (b.excluded !== undefined && typeof b.excluded !== 'boolean') throw badRequest('excluded must be true or false');
  if (consent === undefined && b.excluded === undefined) throw badRequest('Nothing to change');
  res.json(await updateParticipant(a, studyId, studentId, { consent, excluded: b.excluded as boolean | undefined }));
};

const withdraw: H<{ studyId: string; studentId: string }, StudyParticipant> = async (req, res) => {
  res.json(await withdrawParticipant(staffAuth(req), idParam(req.params.studyId), idParam(req.params.studentId)));
};

studyRouter.get('/studies', requireTeacher, list);
studyRouter.post('/studies', requireTeacher, create);
studyRouter.get('/studies/:studyId', requireTeacher, get);
studyRouter.patch('/studies/:studyId', requireTeacher, patch);
studyRouter.put('/studies/:studyId/classes/:classId', requireTeacher, putClass);
studyRouter.delete('/studies/:studyId/classes/:classId', requireTeacher, deleteClass);
studyRouter.get('/studies/:studyId/participants', requireTeacher, participants);
studyRouter.post('/studies/:studyId/participants/sync', requireTeacher, participants);
studyRouter.patch('/studies/:studyId/participants/:studentId', requireTeacher, patchParticipant);
studyRouter.delete('/studies/:studyId/participants/:studentId/research-data', requireTeacher, withdraw);
