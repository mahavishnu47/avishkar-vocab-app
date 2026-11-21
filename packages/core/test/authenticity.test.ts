import { describe, expect, it } from 'vitest';
import {
  AUTH_THRESHOLDS, exampleSimilarity, findPeerMatches, findTemplates, flagsFor, maskTarget, nextTypingCounts, normaliseSentence, typingFlags,
} from '../src/index.ts';

describe('normalise and mask', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normaliseSentence('  The  BRAVE boy, ran!! ')).toBe('the brave boy ran');
  });
  it('masks every form of the target word', () => {
    expect(maskTarget('I like bravely to be brave.', 'brave')).toEqual(['i', 'like', '_', 'to', 'be', '_']);
  });
});

describe('example similarity', () => {
  const ex = 'The brave soldier saved us.';
  it('flags example_copy at >= 0.6 and example_near from 0.4', () => {
    expect(exampleSimilarity('The brave soldier saved us', ex)).toBe(1);
    expect(flagsFor({ text: 'The brave soldier saved us!', example: ex })).toContain('example_copy');
    // tokens: the brave soldier helped them  vs  the brave soldier saved us -> 3/7 = 0.43
    expect(flagsFor({ text: 'The brave soldier helped them', example: ex })).toEqual(['example_near']);
    expect(flagsFor({ text: 'My brother is brave.', example: ex })).toEqual([]);
    expect(AUTH_THRESHOLDS.exampleCopy).toBe(0.6);
  });
});

describe('peer matches', () => {
  const mk = (id: string, studentId: number, at: string, text: string, groupKey = 'w1') => ({ id, studentId, at, text, groupKey });
  it('flags only the later student, never the earliest author', () => {
    const m = findPeerMatches([
      mk('b', 2, '2026-11-20T10:05:00Z', 'My dog is very brave.'),
      mk('a', 1, '2026-11-20T10:00:00Z', 'My dog is very brave'),
    ]);
    expect(m.get('b')).toBe('a');
    expect(m.has('a')).toBe(false);
  });
  it('ignores the same student, other words and low similarity', () => {
    expect(findPeerMatches([mk('a', 1, '1', 'My dog is brave'), mk('b', 1, '2', 'My dog is brave')]).size).toBe(0);
    expect(findPeerMatches([mk('a', 1, '1', 'My dog is brave', 'w1'), mk('b', 2, '2', 'My dog is brave', 'w2')]).size).toBe(0);
    expect(findPeerMatches([mk('a', 1, '1', 'My dog is brave'), mk('b', 2, '2', 'The sky is blue today')]).size).toBe(0);
  });
});

describe('templates', () => {
  const t = (id: string, word: string, text: string, studentId = 1) => ({ id, studentId, scope: 'daily', wordKey: word, word, text });
  it('needs the same frame for 3 different words', () => {
    const two = findTemplates([t('1', 'brave', 'I like brave very much'), t('2', 'gentle', 'I like gentle very much')]);
    expect(two.size).toBe(0);
    const three = findTemplates([
      t('1', 'brave', 'I like brave very much'), t('2', 'gentle', 'I like gentle very much'), t('3', 'happy', 'I like happy very much'),
      t('4', 'tall', 'The tall tree is in the garden'),
    ]);
    expect([...three].sort()).toEqual(['1', '2', '3']);
  });
  it('does not mix students', () => {
    const r = findTemplates([t('1', 'brave', 'I like brave very much', 1), t('2', 'gentle', 'I like gentle very much', 2), t('3', 'happy', 'I like happy very much', 3)]);
    expect(r.size).toBe(0);
  });
});

describe('typing signals', () => {
  it('flags fewer keystrokes than characters', () => {
    expect(typingFlags({ chars: 20, keystrokes: 10, msElapsed: 60000 })).toEqual(['fewer_keys_than_chars']);
    expect(typingFlags({ chars: 20, keystrokes: 25, msElapsed: 60000 })).toEqual([]);
  });
  it('flags more than 4 chars per second and long text in under 4 s', () => {
    expect(typingFlags({ chars: 40, keystrokes: 40, msElapsed: 8000 })).toEqual(['too_fast']); // 5 cps
    expect(typingFlags({ chars: 40, keystrokes: 40, msElapsed: 10000 })).toEqual([]); // 4 cps exactly
    expect(typingFlags({ chars: 25, keystrokes: 25, msElapsed: 3900 })).toContain('too_quick');
    expect(typingFlags({ chars: 24, keystrokes: 24, msElapsed: 3900 })).not.toContain('too_quick');
  });
  it('flags nothing when typing data is missing', () => {
    expect(typingFlags({ chars: 30, keystrokes: null, msElapsed: null })).toEqual([]);
  });
  it('flagsFor adds typing and starter codes', () => {
    expect(flagsFor({ text: 'My brave dog barked at night', keystrokes: 3, msElapsed: 30000, starterUsed: true })).toEqual(['typing', 'starter']);
  });
});

describe('nextTypingCounts', () => {
  it('counts growth as keystrokes and shrinkage as deletions', () => {
    let c = { keystrokes: 0, deletions: 0 };
    c = nextTypingCounts(c, '', 'a');
    c = nextTypingCounts(c, 'a', 'ab');
    c = nextTypingCounts(c, 'ab', 'a');
    expect(c).toEqual({ keystrokes: 2, deletions: 1 });
  });
});
