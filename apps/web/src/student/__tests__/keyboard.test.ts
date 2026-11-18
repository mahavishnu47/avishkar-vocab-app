import { describe, expect, it } from 'vitest';
import { applyKey, autoShiftOn, tileUsage } from '../../shared/OnScreenKeyboard.tsx';
import type { KbConfig, KbResult, KbState } from '../../shared/OnScreenKeyboard.tsx';

const sentence: KbConfig = { mode: 'sentence', maxLength: 160, autoCapitalize: true };
const spelling: KbConfig = { mode: 'spelling', maxLength: 20, autoCapitalize: true };
const type = (cfg: KbConfig, keys: string[], start: KbState = { value: '', shift: null }): KbResult => {
  let s: KbResult = { ...start, rejected: null };
  for (const k of keys) {
    const key = k === '<' ? ({ t: 'back' } as const) : k === ' ' ? ({ t: 'space' } as const) : k === '^' ? ({ t: 'shift' } as const) : ({ t: 'char', ch: k } as const);
    s = applyKey(s, key, cfg);
  }
  return s;
};

describe('spelling mode', () => {
  it('is lowercase letters only', () => {
    expect(type(spelling, ['W', 'h', '1', '.', ' ', 'y']).value).toBe('why');
  });
  it('backspace', () => { expect(type(spelling, ['a', 'b', '<']).value).toBe('a'); });
  it('shift is ignored', () => { expect(applyKey({ value: '', shift: null }, { t: 'shift' }, spelling).rejected).toBe('ignored'); });
  it('maxLength ignores extra keys and flags max', () => {
    const cfg = { ...spelling, maxLength: 3 };
    const s = type(cfg, ['a', 'b', 'c', 'd']);
    expect(s.value).toBe('abc');
    expect(s.rejected).toBe('max');
  });
});

describe('sentence mode', () => {
  it('auto-capitalises the first letter and after ". "', () => {
    expect(autoShiftOn('', sentence)).toBe(true);
    expect(type(sentence, ['i', ' ', 'a']).value).toBe('I a');
    expect(type(sentence, ['i', '.', ' ', 'a']).value).toBe('I. A');
    expect(autoShiftOn('Hi', sentence)).toBe(false);
  });
  it('autoCapitalize off', () => {
    expect(type({ ...sentence, autoCapitalize: false }, ['h']).value).toBe('h');
  });
  it('shift is one-shot', () => {
    expect(type(sentence, ['h', 'i', ' ', '^', 'a', 'b']).value).toBe('Hi Ab');
  });
  it('shift toggles auto-shift off at sentence start', () => {
    expect(type(sentence, ['^', 'a']).value).toBe('a');
  });
  it('space never doubles and is ignored at start', () => {
    expect(type(sentence, [' ']).value).toBe('');
    expect(type(sentence, ['a', ' ', ' ', 'b']).value).toBe('A b');
  });
  it('punctuation after a space replaces the space', () => {
    expect(type(sentence, ['a', 'b', ' ', '.']).value).toBe('Ab.');
    expect(type(sentence, ['a', ' ', ',']).value).toBe('A,');
  });
  it('apostrophe keeps the space; punctuation ignored on empty', () => {
    expect(type(sentence, ['a', ' ', "'"]).value).toBe("A '");
    expect(type(sentence, ['.']).value).toBe('');
  });
  it('maxLength', () => {
    const cfg = { ...sentence, maxLength: 4 };
    const s = type(cfg, ['a', 'b', ' ', 'c', 'd', 'e']);
    expect(s.value).toBe('Ab c');
    expect(s.rejected).toBe('max');
  });
  it('punctuation replacing a space at max length is allowed', () => {
    expect(type({ ...sentence, maxLength: 3 }, ['a', 'b', ' ', '.']).value).toBe('Ab.');
  });
  it('backspace clears shift override', () => {
    // after 'Ab ' shift is forced on, backspace returns to automatic (mid-sentence => lowercase)
    expect(type(sentence, ['a', 'b', ' ', '^', '<', ' ', 'c']).value).toBe('Ab c');
  });
});

describe('restrictToLetters (letter tiles)', () => {
  const cfg: KbConfig = { ...spelling, restrictToLetters: ['l', 'e', 'l', 'x'] };
  it('only tile letters, each tile usable once', () => {
    expect(type(cfg, ['z', 'l', 'l', 'l', 'e']).value).toBe('lle');
  });
  it('tileUsage marks first free tile and frees on delete', () => {
    expect(tileUsage(['l', 'e', 'l', 'x'], 'le')).toEqual([true, true, false, false]);
    expect(tileUsage(['l', 'e', 'l', 'x'], 'l')).toEqual([true, false, false, false]);
    const s = type(cfg, ['l', 'l', '<', 'l']);
    expect(s.value).toBe('ll');
  });
});
