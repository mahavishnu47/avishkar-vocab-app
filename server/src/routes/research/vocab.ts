/** F6 student endpoints: recall challenge and vocabulary bank. requireStudent on each route; own data only. */
import { Router } from 'express';
import type { BankRes, RecallAnswersRes, RecallTodayRes } from '@shabd/core';
import { requireStudent, type StudentAuth } from '../../auth.ts';
import { today } from '../../clock.ts';
import { getDb } from '../../db/db.ts';
import { badRequest, type H } from '../../http.ts';
import { bankFor, recallToday, recordAnswers, type AnswerIn } from '../../services/research/recall.ts';
import { asObject, reqInt, reqIsoTs, reqString } from '../../validate.ts';

export const vocabRouter = Router();

const sid = (req: { auth?: unknown }) => (req.auth as StudentAuth).studentId;

const recallTodayH: H<Record<string, string>, RecallTodayRes> = async (req, res) => {
  res.json(await recallToday(getDb(), sid(req), today()));
};

const answersH: H<Record<string, string>, RecallAnswersRes> = async (req, res) => {
  const o = asObject(req.body);
  if (!Array.isArray(o.answers) || o.answers.length < 1 || o.answers.length > 20) throw badRequest('answers must be a list of 1-20 items');
  const answers: AnswerIn[] = o.answers.map((raw) => {
    const a = asObject(raw);
    return { clientId: reqString(a, 'clientId', 8, 80), itemId: reqString(a, 'itemId', 1, 60), chosen: reqString(a, 'chosen', 1, 300), msElapsed: reqInt(a, 'msElapsed', 0, 86_400_000), clientTs: reqIsoTs(a, 'clientTs') };
  });
  const results = await getDb().tx((q) => recordAnswers(q, sid(req), today(), answers));
  res.json({ results });
};

const bankH: H<Record<string, string>, BankRes> = async (req, res) => {
  res.json({ words: await bankFor(getDb(), sid(req)) });
};

vocabRouter.get('/student/recall/today', requireStudent, recallTodayH);
vocabRouter.post('/student/recall/answers', requireStudent, answersH);
vocabRouter.get('/student/bank', requireStudent, bankH);
