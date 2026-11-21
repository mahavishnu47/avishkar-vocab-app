import type { Migration } from '../migrations.ts';

/** F9: weekly observation checklist and end-of-study feedback questionnaire. Indicator columns: 1 yes, 0 no, NULL not observed. */
export const M0010: Migration[] = [
  {
    version: 10,
    name: 'instruments',
    sql: /* sql */ `
CREATE TABLE observation_records (
  study_id     integer NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  student_id   integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_no      integer NOT NULL CHECK (week_no BETWEEN 1 AND 8),
  accesses     integer CHECK (accesses IN (0,1)),
  meanings     integer CHECK (meanings IN (0,1)),
  pos          integer CHECK (pos IN (0,1)),
  sentences    integer CHECK (sentences IN (0,1)),
  participates integer CHECK (participates IN (0,1)),
  revises      integer CHECK (revises IN (0,1)),
  observed_on  text,
  observer_id  integer REFERENCES teachers(id) ON DELETE SET NULL,
  updated_at   text NOT NULL DEFAULT iso_now(),
  PRIMARY KEY (study_id, student_id, week_no)
);

CREATE TABLE feedback_responses (
  study_id   integer NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  item_no    integer NOT NULL CHECK (item_no BETWEEN 1 AND 5),
  answer     text NOT NULL CHECK (answer IN ('yes','some','no')),
  source     text NOT NULL DEFAULT 'app' CHECK (source IN ('app','paper')),
  updated_at text NOT NULL DEFAULT iso_now(),
  PRIMARY KEY (study_id, student_id, item_no)
);

ALTER TABLE studies ADD COLUMN feedback_open_at text, ADD COLUMN feedback_closed_at text;
`,
  },
];
