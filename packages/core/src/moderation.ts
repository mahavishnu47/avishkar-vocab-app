/**
 * Minimal moderation for child-written sentences (PRD 13.6). OWNER: Lane B.
 * Small English + transliterated Marathi/Hindi blocklist, PII patterns
 * (10-digit phone numbers, emails), safeguarding phrases ("beat me", "hurt me", "touch me").
 */
import { PROFANITY_TOKENS, SAFEGUARDING_PHRASES } from './data/blocklist.ts';

export type ModerationReason = 'profanity' | 'pii' | 'safeguarding';

export interface ModerationResult {
  ok: boolean;
  reason?: ModerationReason;
}

const PROFANITY = new Set(PROFANITY_TOKENS);
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function moderateSentence(text: string): ModerationResult {
  const lower = text.toLowerCase();
  // PII: email, or a 10-digit number (spaces/dashes between digits tolerated, optional +91/0 prefix)
  if (EMAIL.test(text)) return { ok: false, reason: 'pii' };
  const digits = text.replace(/(?<=\d)[\s-]+(?=\d)/g, '');
  if (/(?<!\d)\d{10}(?!\d)/.test(digits)) return { ok: false, reason: 'pii' };
  const spaced = ' ' + lower.replace(/[^a-z']+/g, ' ').trim() + ' ';
  for (const p of SAFEGUARDING_PHRASES) if (spaced.includes(' ' + p + ' ') || (p === 'molest' && spaced.includes(' molest'))) return { ok: false, reason: 'safeguarding' };
  for (const t of spaced.split(' ')) if (t && PROFANITY.has(t)) return { ok: false, reason: 'profanity' };
  return { ok: true };
}
