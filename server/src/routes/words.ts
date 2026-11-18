/**
 * Word bank + daily words (teacher). OWNER: Lane A. Contract: docs/API.md section 4.
 */
import { Router } from 'express';
import type { CreateWordReq, DailySet, SetDailyWordsReq, Word, WordSearchRes } from '@shabd/core';
import { requireTeacher } from '../auth.ts';
import { notImplemented, type H } from '../http.ts';

export const wordsRouter = Router();
wordsRouter.use(['/words', '/classes/:classId/daily-words'], requireTeacher);

type WordQuery = { q?: string; difficulty?: string; partOfSpeech?: string; tag?: string; dayIndex?: string; limit?: string; offset?: string };

const searchWords: H<{}, WordSearchRes, unknown, WordQuery> = notImplemented('GET /api/words');
const createWord: H<{}, Word, CreateWordReq> = notImplemented('POST /api/words');
const getDaily: H<{ classId: string }, DailySet, unknown, { date?: string }> = notImplemented('GET /api/classes/:classId/daily-words');
const putDaily: H<{ classId: string; date: string }, DailySet, SetDailyWordsReq> = notImplemented('PUT /api/classes/:classId/daily-words/:date');
const deleteDaily: H<{ classId: string; date: string }, DailySet> = notImplemented('DELETE /api/classes/:classId/daily-words/:date');

wordsRouter.get('/words', searchWords);
wordsRouter.post('/words', createWord);
wordsRouter.get('/classes/:classId/daily-words', getDaily);
wordsRouter.put('/classes/:classId/daily-words/:date', putDaily);
wordsRouter.delete('/classes/:classId/daily-words/:date', deleteDaily);
