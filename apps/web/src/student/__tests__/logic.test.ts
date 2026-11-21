import { beforeEach, describe, expect, it } from 'vitest';
import { highlightParts, seededShuffle, starterFor } from '../play-logic.ts';
import { localSummary, streakBeforeSession } from '../safe-core.ts';
import { loadSession, pruneSessions, saveSession } from '../../shared/session-store.ts';

describe('play-logic', () => {
  it('seededShuffle is stable and a permutation', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6], '12d001-1');
    expect(a).toEqual(seededShuffle([1, 2, 3, 4, 5, 6], '12d001-1'));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('starters by POS', () => {
    expect(starterFor('noun', 'owl')).toBe('I saw the owl'); // 'the' works before vowels and uncountable nouns
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

describe('offline summary streak (B-02)', () => {
  it('continues a 10-day streak instead of restarting at 1', () => {
    const prev = streakBeforeSession(10, 12, '2026-11-21');
    expect(prev).toEqual({ current: 10, best: 12, lastCompletedDate: '2026-11-20' });
    const perfect = { wordId: 'a', spelling: 40, meaning: 20, sentence: 40, total: 100, stars: 3 as const };
    const s = localSummary(1, '2026-11-21', Array.from({ length: 5 }, (_, i) => ({ ...perfect, wordId: `w${i}` })), prev, '2026-11-21')!;
    expect(s.streak.current).toBe(11);
    expect(s.xp.streakBonus).toBe(50);
  });
  it('starts at 1 when there was no streak', () => {
    expect(streakBeforeSession(0, 3, '2026-11-21').lastCompletedDate).toBeNull();
  });
});

describe('highlightParts precision (B-12)', () => {
  const hl = (s: string, w: string) => highlightParts(s, { word: w }).filter(([, h]) => h).map(([t]) => t);
  it('does not highlight unrelated words that share a prefix', () => {
    expect(hl('The category of cats is big.', 'cat')).toEqual(['cats']);
    expect(hl('Happiness will happen when you are happy.', 'happy')).toEqual(['Happiness', 'happy']); // an accepted form; 'happen' is not
    expect(hl('He will run on the runway.', 'run')).toEqual(['run']);
  });
  it('still highlights inflections and listed forms', () => {
    expect(hl('She was running and he runs.', 'run')).toEqual(['running', 'runs']);
    expect(highlightParts('I lent him a pen.', { word: 'lend', forms: ['lent'] }).filter(([, h]) => h).map(([t]) => t)).toEqual(['lent']);
  });
});
