import { Router } from 'express';
import type { HealthRes } from '@shabd/core';
import type { H } from '../http.ts';
import { claudeEnabled } from '../services/claudeEvaluator.ts';

export const healthRouter = Router();

const health: H<{}, HealthRes> = (_req, res) => {
  res.json({ ok: true, ai: claudeEnabled(), version: '0.1.0' });
};
healthRouter.get('/health', health);
