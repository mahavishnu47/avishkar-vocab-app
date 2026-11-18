/**
 * Minimal moderation for child-written sentences (PRD 13.6). OWNER: Lane B.
 * Small English + transliterated Marathi/Hindi blocklist, PII patterns
 * (10-digit phone numbers, emails), safeguarding phrases ("beat me", "hurt me", "touch me").
 */
export type ModerationReason = 'profanity' | 'pii' | 'safeguarding';

export interface ModerationResult {
  ok: boolean;
  reason?: ModerationReason;
}

export function moderateSentence(text: string): ModerationResult {
  void text;
  throw new Error('not implemented');
}
