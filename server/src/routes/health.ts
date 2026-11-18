import { Router } from 'express';
import type { HealthRes } from '@shabd/core';
import { getDb } from '../db/db.ts';
import type { H } from '../http.ts';
import { claudeEnabled } from '../services/claudeEvaluator.ts';

export const healthRouter = Router();

const health: H<{}, HealthRes & { db?: string; words?: number }> = async (_req, res) => {
  try {
    const row = await getDb().get<{ n: number }>("SELECT COUNT(*) AS n FROM words WHERE source = 'bank'");
    res.json({ ok: true, db: 'ok', words: Number(row?.n ?? 0), ai: claudeEnabled(), version: '0.1.0' });
  } catch (err) {
    console.error('[health] db ping failed', err);
    res.status(503).json({ ok: false, db: 'down', ai: claudeEnabled(), version: '0.1.0' } as never);
  }
};
healthRouter.get('/health', health);
