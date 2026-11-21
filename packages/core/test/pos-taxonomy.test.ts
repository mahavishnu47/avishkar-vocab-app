import { describe, expect, it } from 'vitest';
import { ERROR_LABELS, POS_CHOICES, PosErrorCode } from '../src/index.ts';

describe('part-of-speech taxonomy', () => {
  it('has teacher labels for both outcomes', () => {
    expect(PosErrorCode.WRONG_1).toBe('PS_WRONG_1');
    expect(PosErrorCode.WRONG_2).toBe('PS_WRONG_2');
    expect(ERROR_LABELS.PS_WRONG_1).toBe('Word type: 2nd try');
    expect(ERROR_LABELS.PS_WRONG_2).toBe('Word type: not yet');
  });
  it('offers exactly the four word types', () => {
    expect([...POS_CHOICES]).toEqual(['noun', 'verb', 'adjective', 'adverb']);
  });
});
