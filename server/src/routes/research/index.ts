import { Router } from 'express';
import { studyRouter } from './study.ts';
import { wordPlanRouter } from './wordplan.ts';
import { assessmentsRouter } from './assessments.ts';
import { authenticityRouter } from './authenticity.ts';
import { vocabRouter } from './vocab.ts';
import { progressRouter } from './progress.ts';
import { resultsRouter } from './results.ts';
import { instrumentsRouter } from './instruments.ts';

/** Composes one router per research feature (the gate router is mounted separately, before studentRouter). Never use path-less router.use() inside these. */
export const researchRouter = Router();
researchRouter.use(studyRouter, wordPlanRouter, assessmentsRouter, authenticityRouter, vocabRouter, progressRouter, resultsRouter, instrumentsRouter);
