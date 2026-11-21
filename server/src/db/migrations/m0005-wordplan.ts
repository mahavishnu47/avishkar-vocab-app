import type { Migration } from '../migrations.ts';

/** F2: school-day holidays and the per-study 20-day word plan. */
export const M0005: Migration[] = [
  {
    version: 5,
    name: 'study word plan',
    sql: /* sql */ `
CREATE TABLE study_holidays (
  study_id integer NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  date     text NOT NULL,
  PRIMARY KEY (study_id, date)
);

CREATE TABLE study_plan (
  study_id integer NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  day_no   integer NOT NULL CHECK (day_no >= 1),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 5),
  word_id  text NOT NULL REFERENCES words(id),
  PRIMARY KEY (study_id, day_no, position)
);
`,
  },
];
