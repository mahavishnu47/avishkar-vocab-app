/**
 * Express app factory (no listen) so tests can use supertest. OWNER: Lane A.
 */
import express from 'express';
import { attachAuth } from './auth.ts';
import { errorHandler, notFound } from './http.ts';
import { healthRouter } from './routes/health.ts';
import { authRouter } from './routes/auth.ts';
import { classesRouter } from './routes/classes.ts';
import { wordsRouter } from './routes/words.ts';
import { analyticsRouter } from './routes/analytics.ts';
import { studentRouter } from './routes/student.ts';
import { joinRouter } from './routes/join.ts';
import { schoolRouter } from './routes/school.ts';
import { adminRouter } from './routes/admin.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // x-forwarded-for -> req.ip (rate limits)
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', attachAuth);
  app.use('/api', healthRouter, authRouter, classesRouter, wordsRouter, analyticsRouter, studentRouter, joinRouter, schoolRouter, adminRouter);
  app.use('/api', (_req, _res, next) => next(notFound('Unknown API route')));
  app.use(errorHandler);
  return app;
}
