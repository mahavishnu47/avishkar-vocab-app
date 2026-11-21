import type { Migration } from '../migrations.ts';

/** F5: sentence authenticity signals (typing counts, normalised text hash, teacher review). */
export const M0008: Migration[] = [
  {
    version: 8,
    name: 'authenticity',
    sql: /* sql */ `
ALTER TABLE sentence_submissions
  ADD COLUMN keystrokes integer,
  ADD COLUMN deletions integer,
  ADD COLUMN norm_hash text,
  ADD COLUMN review_status text CHECK (review_status IN ('ok','not_own')),
  ADD COLUMN reviewed_by integer REFERENCES teachers(id) ON DELETE SET NULL;
CREATE INDEX sentence_submissions_word_hash_idx ON sentence_submissions(word_id, norm_hash);
ALTER TABLE assessment_responses ADD COLUMN review_status text CHECK (review_status IN ('ok','not_own'));
`,
  },
];
