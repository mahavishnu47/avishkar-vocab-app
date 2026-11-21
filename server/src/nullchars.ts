/**
 * Postgres cannot store the null character (U+0000) in text, so any request carrying one used to end in an HTTP 500
 * (class names, student names, word search, school name, login email...). Reject it once, centrally, as a normal 400 (S-1).
 */
import type { RequestHandler } from 'express';
import { badRequest } from './http.ts';

function hasNul(v: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof v === 'string') return v.includes('\u0000');
  if (Array.isArray(v)) return v.some((x) => hasNul(x, depth + 1));
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k.includes('\u0000') || hasNul(x, depth + 1)) return true;
  }
  return false;
}

function urlHasNul(url: string): boolean {
  if (url.includes('%00')) return true;
  try { return decodeURIComponent(url).includes('\u0000'); } catch { return false; }
}

export const rejectNulBytes: RequestHandler = (req, _res, next) => {
  if (urlHasNul(req.originalUrl) || hasNul(req.body) || hasNul(req.query)) {
    next(badRequest('Please remove strange characters from what you typed'));
    return;
  }
  next();
};
