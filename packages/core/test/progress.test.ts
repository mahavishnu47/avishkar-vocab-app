import { describe, expect, it } from 'vitest';
import { SKILL_THRESHOLDS, skillLabel } from '../src/index.ts';

describe('skillLabel', () => {
  it('uses the thresholds', () => {
    expect(skillLabel(100)).toBe('Super');
    expect(skillLabel(SKILL_THRESHOLDS.super)).toBe('Super');
    expect(skillLabel(SKILL_THRESHOLDS.super - 1)).toBe('Good');
    expect(skillLabel(SKILL_THRESHOLDS.good)).toBe('Good');
    expect(skillLabel(SKILL_THRESHOLDS.good - 1)).toBe('Keep practising');
    expect(skillLabel(0)).toBe('Keep practising');
  });
});
