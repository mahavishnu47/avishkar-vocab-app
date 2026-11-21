import type { Migration } from '../migrations.ts';

/** F3: the part-of-speech activity stores its taps in word_attempts with stage = 'pos'. */
export const M0006: Migration[] = [
  {
    version: 6,
    name: 'word_attempts_pos_stage',
    sql: `
ALTER TABLE word_attempts DROP CONSTRAINT IF EXISTS word_attempts_stage_check;
ALTER TABLE word_attempts ADD CONSTRAINT word_attempts_stage_check CHECK (stage IN ('spell','meaning','pos'));
`,
  },
];
