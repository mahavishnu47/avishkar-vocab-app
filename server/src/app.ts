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

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', attachAuth);
  app.use('/api', healthRouter, authRouter, classesRouter, wordsRouter, analyticsRouter, studentRouter);
  app.use('/api', (_req, _res, next) => next(notFound('Unknown API route')));
  app.use(errorHandler);
  return app;
}
