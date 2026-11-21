/**
 * Express app factory (no listen) so tests can use supertest. OWNER: Lane A.
 */
import './env.ts'; // clean BOMs/whitespace from environment values first (H-1)
import express from 'express';
import { attachAuth } from './auth.ts';
import { errorHandler, notFound } from './http.ts';
import { rejectNulBytes } from './nullchars.ts';
import { healthRouter } from './routes/health.ts';
import { authRouter } from './routes/auth.ts';
import { classesRouter } from './routes/classes.ts';
import { wordsRouter } from './routes/words.ts';
import { analyticsRouter } from './routes/analytics.ts';
import { studentRouter } from './routes/student.ts';
import { studentProgressRouter } from './routes/studentProgress.ts';
import { joinRouter } from './routes/join.ts';
import { schoolRouter } from './routes/school.ts';
import { adminRouter } from './routes/admin.ts';
import { researchRouter } from './routes/research/index.ts';
import { studyGateRouter } from './routes/research/studyGate.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // x-forwarded-for -> req.ip (rate limits). Trusting every hop let anyone fake an IP and dodge the limits (S-5):
  // Vercel is exactly one proxy hop and overwrites the header; elsewhere set TRUST_PROXY_HOPS; tests simulate IPs.
  app.set('trust proxy', process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS)
    : process.env.VERCEL ? 1 : process.env.NODE_ENV === 'test' ? true : false);
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', rejectNulBytes); // null characters crash Postgres text columns (S-1)
  app.use('/api', attachAuth);
  app.use('/api', healthRouter, authRouter, classesRouter, wordsRouter, analyticsRouter, studyGateRouter, studentRouter, studentProgressRouter, joinRouter, schoolRouter, adminRouter, researchRouter);
  app.use('/api', (_req, _res, next) => next(notFound('Unknown API route')));
  app.use(errorHandler);
  return app;
}
