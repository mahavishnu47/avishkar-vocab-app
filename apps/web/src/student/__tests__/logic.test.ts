import { beforeEach, describe, expect, it } from 'vitest';
import { highlightParts, seededShuffle, starterFor } from '../play-logic.ts';
import { loadSession, pruneSessions, saveSession } from '../../shared/session-store.ts';

describe('play-logic', () => {
  it('seededShuffle is stable and a permutation', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6], '12d001-1');
    expect(a).toEqual(seededShuffle([1, 2, 3, 4, 5, 6], '12d001-1'));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('starters by POS', () => {
    expect(starterFor('noun', 'owl')).toBe('I saw a owl');
    expect(starterFor('verb', 'run')).toBe('Every day I run');
    expect(starterFor('pronoun', 'we')).toBe('I we');
  });
  it('highlights the word and inflections', () => {
    const p = highlightParts('The children whisper and whispered.', { word: 'whisper' });
    expect(p.filter(([, h]) => h).map(([t]) => t)).toEqual(['whisper', 'whispered']);
  });
});

describe('session-store', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips and prunes', () => {
    saveSession(5, { a: 1 }); saveSession(6, { a: 2 });
    expect(loadSession(5)).toEqual({ a: 1 });
    pruneSessions([6]);
    expect(loadSession(5)).toBeNull();
    expect(loadSession(6)).toEqual({ a: 2 });
  });
});
