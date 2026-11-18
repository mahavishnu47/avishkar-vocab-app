import { describe, expect, it } from 'vitest';
import { moderateSentence } from '../src/index.ts';

describe('moderateSentence', () => {
  it('accepts normal sentences', () => {
    expect(moderateSentence('The brave soldier saved the village.')).toEqual({ ok: true });
    expect(moderateSentence('I have 3 pencils and 12 marbles.')).toEqual({ ok: true });
    expect(moderateSentence('The cock crowed at dawn.').ok).toBe(true);
  });
  it('flags profanity (English and transliterated)', () => {
    expect(moderateSentence('You are a bitch.')).toEqual({ ok: false, reason: 'profanity' });
    expect(moderateSentence('Tu gandu hai')).toEqual({ ok: false, reason: 'profanity' });
    expect(moderateSentence('What the FUCK')).toEqual({ ok: false, reason: 'profanity' });
  });
  it('does not flag words merely containing a blocked substring', () => {
    expect(moderateSentence('The class assessed the bass.').ok).toBe(true);
    expect(moderateSentence('Sussex is in England.').ok).toBe(true);
  });
  it('flags PII', () => {
    expect(moderateSentence('Call 9876543210 now')).toEqual({ ok: false, reason: 'pii' });
    expect(moderateSentence('Call 98765 43210 now').reason).toBe('pii');
    expect(moderateSentence('write to a.b@school.in please').reason).toBe('pii');
    expect(moderateSentence('I am 10 years old and 1234567 is my roll').ok).toBe(true);
  });
  it('flags safeguarding phrases', () => {
    expect(moderateSentence('My uncle will hurt me.')).toEqual({ ok: false, reason: 'safeguarding' });
    expect(moderateSentence('He wants to touch me').reason).toBe('safeguarding');
    expect(moderateSentence('Dad beat me yesterday').reason).toBe('safeguarding');
  });
});
