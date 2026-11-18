/**
 * SQLite schema. OWNER: Lane A (server). Append new migrations; never edit an applied one.
 * Conventions: INTEGER PKs (except words.id = content id), dates 'YYYY-MM-DD' (IST),
 * timestamps ISO-8601 TEXT, JSON arrays stored as TEXT columns suffixed _json, booleans 0/1.
 */
export interface Migration { version: number; name: string; sql: string }

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: /* sql */ `
CREATE TABLE teachers (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,              -- 'scrypt$<saltHex>$<hashHex>' (node:crypto)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE classes (
  id               INTEGER PRIMARY KEY,
  teacher_id       INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  class_code       TEXT NOT NULL UNIQUE,    -- 6 chars, A-Z2-9 without 0/O/1/I
  start_date       TEXT NOT NULL,           -- maps to content dayIndex 1
  leaderboard_mode TEXT NOT NULL DEFAULT 'individual' CHECK (leaderboard_mode IN ('individual','hidden')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE students (
  id               INTEGER PRIMARY KEY,
  class_id         INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  roll_no          INTEGER NOT NULL,
  first_name       TEXT NOT NULL,
  avatar           TEXT NOT NULL,           -- emoji
  pin              TEXT NOT NULL CHECK (length(pin) = 4), -- plain 4 digits: printed on login cards (low-stakes, documented risk)
  active           INTEGER NOT NULL DEFAULT 1,
  failed_pin_count INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,                    -- 5 wrong PINs -> 5 min lock
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (class_id, roll_no)
);

CREATE TABLE auth_tokens (
  token      TEXT PRIMARY KEY,              -- 32 random bytes hex
  role       TEXT NOT NULL CHECK (role IN ('teacher','student')),
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,                 -- teacher 7 days, student 60 days
  CHECK ((role = 'teacher' AND teacher_id IS NOT NULL) OR (role = 'student' AND student_id IS NOT NULL))
);

-- Word bank (content/words/*.json, source='bank', id 'dNNN-S') + teacher custom words (source='teacher', id 'c-<n>').
CREATE TABLE words (
  id                 TEXT PRIMARY KEY,
  day_index          INTEGER,               -- NULL for teacher words
  word               TEXT NOT NULL,
  part_of_speech     TEXT NOT NULL,
  difficulty         INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  meaning            TEXT NOT NULL,
  meaning_marathi    TEXT NOT NULL DEFAULT '',
  example_sentence   TEXT NOT NULL,
  distractors_json   TEXT NOT NULL,         -- [string, string]
  syllables_json     TEXT NOT NULL DEFAULT '[]',
  tags_json          TEXT NOT NULL DEFAULT '[]',
  context_words_json TEXT NOT NULL DEFAULT '[]',
  forms_json         TEXT NOT NULL DEFAULT '[]',
  source             TEXT NOT NULL CHECK (source IN ('bank','teacher')),
  created_by         INTEGER REFERENCES teachers(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX words_day_idx ON words(day_index);
CREATE INDEX words_word_idx ON words(word);

-- Teacher override of a date's 5 words. No rows for (class, date) => auto set by dayIndex.
CREATE TABLE daily_word_overrides (
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  position   INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  word_id    TEXT NOT NULL REFERENCES words(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (class_id, date, position)
);

-- One session per student per date ('today' mode only in the MVP).
CREATE TABLE sessions (
  id              INTEGER PRIMARY KEY,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id        INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  day_index       INTEGER NOT NULL,
  word_ids_json   TEXT NOT NULL,            -- snapshot of the 5 word ids at session start
  started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at    TEXT,
  total_marks     INTEGER,
  xp_awarded      INTEGER,
  scoring_version TEXT NOT NULL,
  UNIQUE (student_id, date)
);
CREATE INDEX sessions_class_date_idx ON sessions(class_id, date);

-- Stage 1 (spell) and Stage 2 (meaning) attempts. Core research log.
CREATE TABLE word_attempts (
  id            INTEGER PRIMARY KEY,
  client_id     TEXT NOT NULL UNIQUE,       -- idempotency key from the client outbox
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  word_id       TEXT NOT NULL REFERENCES words(id),
  stage         TEXT NOT NULL CHECK (stage IN ('spell','meaning')),
  attempt_no    INTEGER NOT NULL,
  input_text    TEXT NOT NULL,
  is_correct    INTEGER NOT NULL,
  hints_json    TEXT NOT NULL DEFAULT '[]', -- spell: ['first_letter','letter_tiles']
  error_tags_json TEXT NOT NULL DEFAULT '[]', -- spell: SpellingErrorCode[]
  primary_error TEXT,                       -- spell: SpellingErrorCode; meaning: MN_WRONG_1/MN_WRONG_2 on the final attempt row
  edit_distance INTEGER,
  audio_plays   INTEGER NOT NULL DEFAULT 0,
  ms_elapsed    INTEGER NOT NULL DEFAULT 0,
  client_ts     TEXT NOT NULL,
  server_ts     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX word_attempts_session_idx ON word_attempts(session_id, word_id, stage);
CREATE INDEX word_attempts_student_idx ON word_attempts(student_id, stage);

-- Stage 3 submissions incl. gated (not counted) ones, for analytics (SN_WORD_MISSING etc.).
CREATE TABLE sentence_submissions (
  id                INTEGER PRIMARY KEY,
  client_id         TEXT NOT NULL UNIQUE,
  session_id        INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  word_id           TEXT NOT NULL REFERENCES words(id),
  submission_no     INTEGER NOT NULL,       -- 1 or 2 (as sent; only counted rows matter for scoring)
  text              TEXT NOT NULL,
  gate              TEXT NOT NULL,          -- SentenceGate
  counted           INTEGER NOT NULL,       -- 1 if gate = 'ok'
  r_use             INTEGER NOT NULL DEFAULT 0,
  r_grammar         INTEGER NOT NULL DEFAULT 0,
  r_relevance       INTEGER NOT NULL DEFAULT 0,
  r_length          INTEGER NOT NULL DEFAULT 0,
  raw_total         INTEGER NOT NULL DEFAULT 0,
  multiplier        REAL NOT NULL DEFAULT 1,
  hint_cost         INTEGER NOT NULL DEFAULT 0,
  final_marks       INTEGER,                -- NULL when not counted
  error_codes_json  TEXT NOT NULL DEFAULT '[]',
  feedback_json     TEXT NOT NULL DEFAULT '[]',
  confidence        REAL NOT NULL DEFAULT 1,
  evaluator         TEXT NOT NULL,          -- 'rules-1' | 'claude:<model>'
  tip               TEXT,
  rules_json        TEXT,                   -- rule-based evaluation kept alongside a Claude one (research comparison)
  moderation_reason TEXT,                   -- profanity | pii | safeguarding
  ms_elapsed        INTEGER NOT NULL DEFAULT 0,
  client_ts         TEXT NOT NULL,
  server_ts         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX sentence_submissions_session_idx ON sentence_submissions(session_id, word_id);
CREATE INDEX sentence_submissions_student_idx ON sentence_submissions(student_id);

-- Denormalised per-word result (written by POST .../words/:wordId/complete).
CREATE TABLE word_scores (
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  word_id         TEXT NOT NULL REFERENCES words(id),
  position        INTEGER NOT NULL,
  spelling        INTEGER NOT NULL,
  meaning         INTEGER NOT NULL,
  sentence        INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  stars           INTEGER NOT NULL,
  spell_first_try INTEGER NOT NULL,         -- 1 if correct on attempt 1 (Spelling Strength)
  scoring_version TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (session_id, word_id)
);

-- Append-only XP ledger. One row per (session, source) => completing twice is idempotent.
CREATE TABLE xp_ledger (
  id             INTEGER PRIMARY KEY,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  week_start     TEXT NOT NULL,             -- Monday, for the weekly leaderboard
  source         TEXT NOT NULL CHECK (source IN ('word','completion','streak','perfect','adjustment')),
  amount         INTEGER NOT NULL,
  ref_session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (ref_session_id, source)
);
CREATE INDEX xp_ledger_student_week_idx ON xp_ledger(student_id, week_start);

CREATE TABLE streaks (
  student_id          INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  current             INTEGER NOT NULL DEFAULT 0,
  best                INTEGER NOT NULL DEFAULT 0,
  last_completed_date TEXT
);
`,
  },
];
