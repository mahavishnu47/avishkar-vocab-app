# Onboarding Redesign Spec: Schools, Teachers, Students (v2)

Status: **build contract**. Where this spec conflicts with PRD.md, API.md or UI_SPEC.md, this spec wins (O6 updates those docs to match).
Context: Maharashtra Std 5 pilot, about 200 students on **home phones** (low-end Android, Chrome), age 10-11, English-only UI. A principal or coordinator runs the school, teachers run classes, and parents hand the phone to the child at home.

## 0. Summary of decisions

| # | Decision |
|---|---|
| D1 | New hierarchy: **Platform owner (super admin) → School → Teachers (one or more are school admins) → Classes → Students.** A school admin is a teacher row with `role = 'school_admin'`. There is no separate admin user table. |
| D2 | Schools are created **by invitation only**. There is no self-signup for the pilot. The super admin creates a school and gets a one-time **school setup link** to send to the principal on WhatsApp. |
| D3 | Super admin tool: an **env-protected `/admin` page** (secret `SUPER_ADMIN_SECRET`, sent as a header), backed by `/api/admin/*`. A CLI script (`npm run admin -- create-school`) calls the same service, for scripts and e2e. The page is primary because the owner can use it from a phone without database credentials. |
| D4 | `TEACHER_INVITE_CODE` is **removed**. Teachers join a school with that school's **teacher invite code** (`ABCD-EFGH`, 8 characters, 40 bits, expires, can be revoked), usually as a link `/t/ABCDEFGH` shared on the staff WhatsApp group. Joining is instant. The admin can turn a teacher off afterwards. |
| D5 | Everything is email-less except the teacher's own login (email + password, as today). A forgotten teacher password is fixed by a **reset link** that the school admin makes (or the super admin, for school admins). No email is ever sent. |
| D6 | Students join through a **class link `/j/K7Q2MX`** (the existing `class_code`) or its QR code, or a **school link `/s/DEMSCH`** that lists the classes. Flow: tap your name → 4-digit PIN on a big keypad → 30-second welcome → Home. |
| D7 | The device remembers each child as a **profile** (up to 6 per phone). Next time: one profile opens straight to Home (1 tap to Play). Several profiles open **"Who's playing?"** (1 tap on your face). No PIN for a remembered profile. A PIN reset by the teacher signs that child out on every phone. |
| D8 | Student tokens become **sliding** (60 days, renewed on use), so a child who plays weekly never sees the PIN again. |
| D9 | Tenant isolation lives in one server module (`server/src/tenancy.ts`). Every class or student access goes through it. A cross-school access returns **404**, never 403, so nothing leaks. |
| D10 | Rate limits are stored in Postgres (serverless-safe), keyed by a hashed IP. They work **in addition to** the per-student PIN lockout, which stays as it is. |
| D11 | QR codes use **`qrcode-generator@2.0.4`** (MIT, zero dependencies, maintained since 2009, rendered as an SVG string). It is loaded only in the teacher and school bundles, never in the student path. |
| D12 | Privacy: the only student data is first name + roll number + emoji avatar. Pasted full names keep **only the first word**. There is no student email or phone anywhere. Audit rows store IDs, not names. |

---

## 1. Roles and hierarchy

```
Super admin (us)  -- SUPER_ADMIN_SECRET; no DB user
  └─ School (name, district, optional UDISE code, student link code)
       ├─ School admin(s)  = teachers.role 'school_admin' (principal / coordinator; may also teach)
       └─ Teachers         = teachers.role 'teacher'
            └─ Classes (standard + division, e.g. 5A; academic year; class_code = join code)
                 └─ Students (roll no, first name, avatar, 4-digit PIN)
```

| Capability | Super admin | School admin | Teacher | Student |
|---|---|---|---|---|
| Create, suspend or rename schools; make school setup links | ✅ | | | |
| See and rename own school; make or revoke the teacher invite; rotate the school student link | | ✅ | | |
| List teachers; turn a teacher off or on; promote or demote; make a password reset link | | ✅ (own school) | | |
| See all classes in the school, school-wide progress, reassign or archive classes | | ✅ | | |
| Create classes, add students, share links, print cards, words, dashboard, analytics | | ✅ (any class in own school) | ✅ (own classes) | |
| See and reset student PINs | | ✅ (own school) | ✅ (own classes) | |
| Play, see own progress and the class leaderboard | | | | ✅ |

Rules:
- A teacher belongs to exactly **one** school (email is globally unique, as today). Multi-school teachers are out of scope.
- A school must always keep **at least one active school admin**. Demoting or turning off the last one returns 409.
- Teachers never see other teachers' classes. Co-teaching is out of scope: the admin can reassign a class instead.
- Nothing is ever hard-deleted. Teachers and students are turned off (`active = 0`), classes are archived, and schools are suspended.

**School signup: invite only.** Reasons: it is a closed research pilot (ethics approval and consent are per school), it prevents spam schools on a public URL, and it is the smallest build. The landing page's "My School" tile has a "New school? Contact us" line, with the contact from `VITE_CONTACT_TEXT` (for example a WhatsApp number). Self-signup with approval is Phase 2.

---

## 2. Journeys

Tap counts exclude typing. Every journey ends on a screen with **one obvious next action**.

### 2.1 Super admin (us): about 1 minute per school

1. Open `/admin` and type the secret once (kept in `sessionStorage`).
2. **Schools** list → "+ New school": name (required), district (optional), UDISE code (optional, 11 digits) → **Create**.
3. The result card shows the **school setup link** `https://<app>/a/ABCDEFGH` (single use, 14 days), with **Copy**, **WhatsApp** and **Share** buttons and this ready text:
   > Namaste! Your school is ready on Shabd Mitra 🦜. Open this link to set up your school (takes 1 minute): https://…/a/ABCDEFGH. This link works once and ends on 4 Dec.
4. Per school row: counts (teachers, classes, students), **New setup link** (for a lost link or a second admin), **Suspend / Resume**.

### 2.2 School admin (principal or coordinator)

**First run: 3 screens, about 2 minutes.**

| Step | Screen | What happens |
|---|---|---|
| 1 | `/a/:code` → `/school/setup/:code` | "Set up **Zilla Parishad School, Kalwa**" (the name comes from `GET /invites/:code`). Fields: your name, email, password (8+ characters, with a show toggle). Button **Create my account**. An invalid or used code shows "This link has expired or was already used. Ask Shabd Mitra for a new one." |
| 2 | `/school` (first-run checklist on top) | The server has already made the school's **teacher invite** when the account was created. Checklist card: |
| | | ☐ **Invite your teachers**: big **WhatsApp** button (also Copy and Share) with the teacher link `…/t/ABCDEFGH` and the code `ABCD-EFGH`. Tapping it ticks the item (`PATCH /school {teacherLinkShared:true}`). |
| | | ☐ **First teacher joined** (automatic) |
| | | ☐ **First class created** (automatic) |
| | | ☐ **First student played** (automatic) |
| | | ☐ *(optional)* **Create your own class**, for a principal who also teaches (opens the teacher wizard) |
| 3 | `/school` dashboard | Once all items are done, the checklist folds into a small "Setup complete ✅" line and the progress view takes over. |

Teacher WhatsApp text (built by core `teacherInviteText()`):
> Join our school on Shabd Mitra 🦜 (daily English words for Std 5). 1) Open https://…/t/ABCDEFGH 2) Enter your name, email and a password. School code: ABCD-EFGH. Works until 20 Dec.

**Everyday screens (`/school/*`):**
- **Progress** (`/school`): a date picker (default today) and totals: teachers, classes, students, joined (logged in at least once), played today. A table with one row per class: Class · Teacher · Students · Joined (x/y with a bar) · Played today · This week %. Tapping a row opens that class's dashboard (`/teacher/classes/:id/dashboard`); the admin has access.
- **Teachers** (`/school/teachers`): name, email, role, classes, last login, on/off switch. Row actions: **Make admin / Remove admin**, **Reset password** (makes a 24-hour single-use link `…/r/ABCDEFGH` with a WhatsApp button), **Turn off** (signs them out; their classes stay and show a "needs a teacher" badge). Top card: the current teacher invite (code, link, expiry, uses) with **Share**, **New code** (revokes the old one) and **Turn off code**.
- **Classes** (`/school/classes`): all classes in the school with the teacher, counts and join on/off. Actions: **Change teacher** (a select of active teachers), **Archive**.
- **Settings** (`/school/settings`): school name and district. The **student school link** `…/s/DEMSCH` with a QR code, WhatsApp text and a printable poster ("Scan to play Shabd Mitra"), plus **New link** (rotate). **Recent activity**: the last 50 audit rows in plain words ("Mrs. Patil reset Riya's PIN").
- Reset access in one place: from any class, the admin opens the roster and uses **Reset PIN**, like a teacher.

### 2.3 Teacher

**Join: under 60 seconds, 1 screen.**

| Step | Screen | What happens |
|---|---|---|
| 1 | `/t/:code` → `/teacher/join/:code` | "Join **ZP School Kalwa**". Fields: your name, email, password (with a show toggle). Button **Join school**. With no code in the URL (`/teacher/join`), a first field "School code" accepts `ABCD-EFGH`; dashes, spaces and lowercase are ignored. |
| 2 | → `/teacher` | Home with the first-run checklist. |

`/teacher/login` keeps email + password, adds **"New teacher? Join your school"** (→ `/teacher/join`), and adds **"Forgot password? Ask your school admin for a reset link."** (text only). It accepts `?next=/school` (only `/school…` and `/teacher…` are allowed). After login, a school admin without `next` lands on `/teacher` and sees a **School** button in the nav.

**First-run checklist on `/teacher` (Home).** It is computed by the server (`GET /teacher/overview`):

1. ☐ **Create your class** → `/teacher/classes/new`
2. ☐ **Add your students** → `/teacher/classes/:id/students/add`
3. ☐ **Share the join link with parents** → `/teacher/classes/:id/share` (ticked when the teacher taps WhatsApp, Copy, Share or Print)
4. ☐ **First student joined** (automatic; shows "3 of 42 joined" as it grows)
5. Tip line, not a checkbox: "Words for each day are ready. Change them any time in **Words**."

Below the checklist, class cards show: name, code, students, joined x/y, played today. Once the checklist is complete and there is exactly one class, `/teacher` redirects to that class's dashboard (today's behaviour).

**Create a class: 1 screen, 3 taps** (`/teacher/classes/new`):
- **Standard**: chips 1-10, 5 preselected.
- **Division**: chips A B C D E F plus "Other" (a 1-3 character text field). None is allowed, which gives "5".
- **Words start on**: default "Today". "Change" reveals a date input (this maps content day 1).
- The name is automatic (`5A`), shown as a preview: "Class name: **5A**".
- Button **Create class** → goes straight to step 2. A duplicate in the same school and academic year returns 409: "Class 5A already exists in your school. Ask your school admin."

**Add students: 1 screen** (`/teacher/classes/:id/students/add`):
- One big textarea: "Paste your class list (from WhatsApp, Excel or Google Sheets)." Accepted line formats (parser `parseRosterText` in `teacher/util.ts`):
  - `7, Riya` · `7 Riya` · `7. Riya` · `7<TAB>Riya` (Excel or Sheets copy) · `7, Riya Patil` → first word only, with a notice: "We keep first names only."
  - `Riya` alone → roll numbers are given automatically, continuing after the highest existing roll.
  - Blank lines and a header line (`roll,name`, `Roll No  Name`) are ignored.
- **Or upload a CSV file** (`<input type=file accept=".csv,text/csv">`, read with FileReader, same parser; Excel "Save as CSV" works).
- Live preview table: roll, name, avatar. Errors are shown inline in simple English ("Line 4: roll number 7 is used twice"). A duplicate first name shows a note: "Two students are called Riya. They will see their roll number."
- A required checkbox: "☐ Parents have given consent (school consent form)." Saving sends `consentConfirmed: true`, which stores `classes.consent_attested_at`.
- Button **Save 42 students** → goes to the Share screen. Maximum 100 rows per request. The client sends the whole list once.
- The roster (`/teacher/classes/:id/roster`) keeps the table and gains two columns: **Joined** (✅ with the first login date, or "not yet") and **Locked 🔒** (when locked). Reset PIN now also signs the child out on all phones.

**Share: 1 screen** (`/teacher/classes/:id/share`, also a nav tab "Share"):
- Big **QR code** (SVG, 240 px) of the join link, the link in large text `shabd…/j/K7Q2MX`, and the class code.
- Buttons: **Send on WhatsApp** (`https://wa.me/?text=<encoded>`; `navigator.share` first when available), **Copy link**, **Copy message**, **Print login cards** (→ `/teacher/classes/:id/cards`), **Show on screen** (a full-screen QR for a classroom projector).
- WhatsApp text (core `classJoinText()`, no PINs):
  > Shabd Mitra 🦜: 5 new English words every day, for Class 5A, ZP School Kalwa. On your child's phone: 1) Open https://…/j/K7Q2MX 2) Tap your child's name 3) Type the 4-digit PIN from the card the teacher gave. Free. No ads. About 15 minutes a day.
- A toggle **Students can join with this link** (on/off), and **Make a new link** (rotates `class_code`, with the warning "Old link and printed cards stop working for new phones. Children already playing are not affected.").
- **Login cards** (existing page, upgraded): 8 per A4. Each card has the avatar, first name, roll number, PIN in large digits, the class QR code, the short link and "Ask a grown-up to open this link". A footer line: "Keep this card safe. It is your key."

**What next.** After the first student joins, the checklist hides and Home shows a single "Next" hint chosen in this order: "*n* students have not joined yet → Share again" · "Check today's words → Words" · "See who played today → Today".

### 2.4 Student (age 10-11, a parent's phone)

**First time: 3 decisions, about 30 seconds, plus the optional tutorial.**

| Step | Screen | Taps |
|---|---|---|
| 0 | A parent opens the WhatsApp link or scans the card QR → `/j/K7Q2MX` | 1 |
| 1 | **Tap your name** (`/j/:code`): header "Class 5A · ZP School Kalwa", 🔊 "Find your name", a grid of avatar + first name (2 columns, 64 px). A duplicate first name shows the roll number ("Riya · 7"). With more than 24 students, a row of letter chips (only letters that are present) jumps to that letter. | 1 |
| 2 | **Your PIN** (`/j/:code/pin/:studentId`): big avatar and name, 4 dots, a keypad (3×4, keys at least 72 px), automatic submit on the 4th digit. "Forgot PIN? 🙋" → a friendly screen: "Ask your teacher for your PIN card 🙂" (with a 🔊 button). | 4 digits |
| 3 | **Welcome** (`/welcome`, only when the server says `firstLogin: true`): 3 cards, about 30 seconds in total. Each card speaks its line automatically (`speak()`), has a big "Next ▶" and a small "Skip". | 3 (or 1 skip) |
| | Card 1 🔵 "Listen and spell" / "Hear the word. Type it." | |
| | Card 2 🟢 "Learn the meaning" / "Read it. Pick the right meaning." | |
| | Card 3 🟣 "Write a sentence" / "Use the word your way." Then "5 words a day. Win ⭐ and keep your 🔥!" with **Let's play ▶** → `/` (Home). | |
| 4 | **Home** → Play ▶ (unchanged) | 1 |

From the school link `/s/DEMSCH`, a step 0.5 is added: **Pick your class** (big tiles "5A", "5B", in standard order).
Fallback with no link: Landing `/` → **I'm a Student** → `/login` (class code field, id `#cc` kept for e2e) → the same name, PIN and welcome steps.

**Next time: 1 tap.**
- One profile on the phone: the app opens straight to **Home** ("Hi Riya 🦁") → **Play ▶**.
- Two or more profiles: **"Who's playing?"** (`/who`) shows big avatar tiles (name and class) sorted by most recent use. Tapping one opens Home. Tiles: **+ Add a player** (→ `/login`, or the last link used). **Edit** mode shows ✕ "Remove from this phone" on each tile (with a confirmation in kid language: "Remove Riya from this phone?").
- Home's top bar gets a **switch** button (avatar with ⇄) that opens `/who` instead of logging out. "Not you?" goes to `/who`.
- A profile whose token is rejected (PIN reset, student turned off, expiry) is marked **"Type your PIN again"**. Tapping it goes straight to that child's PIN pad (the class code is stored in the profile). If the class link was rotated or turned off: "Ask your teacher for the new link 🙂".
- Maximum 6 profiles. Adding a 7th removes the least recently used one, after a confirmation.

**Install to home screen (PWA)** (`student/InstallPrompt.tsx`):
- Capture `beforeinstallprompt` as soon as the student bundle loads. Show the card only **after the first completed session** (on Summary → back to Home), never during onboarding: "📲 Put Shabd Mitra on your home screen" with an **Add** button that calls `prompt()`. Hide it if `display-mode: standalone` matches.
- With no event available (an in-app browser such as the WhatsApp webview, or an old Chrome), show a text version: "Open in Chrome, tap ⋮, then 'Add to Home screen'". If `navigator.userAgent` contains `WhatsApp` or `wv` on the first link open, show a top banner on the name screen: "For best results, open in Chrome ⋮ → Open in Chrome". Opening inside the webview still works, but its storage may not persist.
- "Not now" hides it for 7 days (`shabd.installDismissedAt`). After 3 dismissals it never shows again.

---

## 3. Data model and migration v2

### 3.1 Changes

| Table | Change | Why |
|---|---|---|
| `schools` (new) | id, name, district, udise_code, student_code (6 characters, unique, for `/s/` links), status, teacher_link_shared_at, created_at | Tenant root |
| `teachers` | + school_id (NOT NULL after backfill), role (`teacher`/`school_admin`), active, last_login_at | Membership and roles live on the teacher row |
| `classes` | + school_id (NOT NULL), standard, division, academic_year, archived, join_enabled, link_shared_at, consent_attested_at, consent_attested_by | Class join (the existing `class_code` *is* the join code), wizard fields, checklist |
| `students` | + first_login_at, last_login_at | "Joined" counts; the `firstLogin` flag |
| `auth_tokens` | + last_used_at | Sliding expiry |
| `words` | + school_id (NULL for bank words) | Custom teacher words are visible only inside their school (today they are global) |
| `invites` (new) | school_admin setup links, teacher invites, password resets | Replaces `TEACHER_INVITE_CODE` |
| `rate_limits` (new) | fixed-window counters | Serverless-safe throttling |
| `audit_log` (new) | who did what (IDs only) | Accountability, the "Recent activity" list |

There is no separate device-token table. Each device profile holds a normal student `auth_tokens` row (one per child per phone). "Sign out on all phones" means `DELETE FROM auth_tokens WHERE student_id = ?`.

### 3.2 Exact SQL: append to `MIGRATIONS` in `server/src/db/migrations.ts`

The SQL is additive, runs once inside the existing migrate transaction, and backfills existing data into a default school. It contains **no `?` characters**: they would be harmless in `exec`, but this avoids any confusion with `toPgSql`.

```ts
  {
    version: 2,
    name: 'schools, roles, invites, join, rate limits, audit',
    sql: /* sql */ `
-- Random code from the unambiguous alphabet (backfill only; the app generates codes with node:crypto).
CREATE OR REPLACE FUNCTION shabd_rand_code(n integer) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  FROM generate_series(1, n) $$;

CREATE TABLE schools (
  id                     integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name                   text NOT NULL,
  district               text NOT NULL DEFAULT '',
  udise_code             text,                         -- optional 11-digit government school code
  student_code           text NOT NULL UNIQUE,         -- 6 chars, /s/<code> lists the school's classes
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  teacher_link_shared_at text,                         -- checklist: admin tapped share on the teacher invite
  created_at             text NOT NULL DEFAULT iso_now()
);

-- teachers: membership + role
ALTER TABLE teachers ADD COLUMN school_id integer REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE teachers ADD COLUMN role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher','school_admin'));
ALTER TABLE teachers ADD COLUMN active integer NOT NULL DEFAULT 1;
ALTER TABLE teachers ADD COLUMN last_login_at text;

-- classes: school, wizard fields, join + checklist state
ALTER TABLE classes ADD COLUMN school_id integer REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE classes ADD COLUMN standard integer NOT NULL DEFAULT 5 CHECK (standard BETWEEN 1 AND 12);
ALTER TABLE classes ADD COLUMN division text NOT NULL DEFAULT '';          -- '' or 1-3 chars, uppercase
ALTER TABLE classes ADD COLUMN academic_year text NOT NULL DEFAULT '';     -- '2026-27' (June-May)
ALTER TABLE classes ADD COLUMN archived integer NOT NULL DEFAULT 0;
ALTER TABLE classes ADD COLUMN join_enabled integer NOT NULL DEFAULT 1;
ALTER TABLE classes ADD COLUMN link_shared_at text;
ALTER TABLE classes ADD COLUMN consent_attested_at text;
ALTER TABLE classes ADD COLUMN consent_attested_by integer REFERENCES teachers(id) ON DELETE SET NULL;

-- students: join tracking (no new PII)
ALTER TABLE students ADD COLUMN first_login_at text;
ALTER TABLE students ADD COLUMN last_login_at text;

-- tokens: sliding expiry
ALTER TABLE auth_tokens ADD COLUMN last_used_at text;

-- custom words scoped to a school (NULL = word bank)
ALTER TABLE words ADD COLUMN school_id integer REFERENCES schools(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------- backfill
INSERT INTO schools (name, district, student_code)
SELECT 'My School', '', shabd_rand_code(6) WHERE EXISTS (SELECT 1 FROM teachers);

UPDATE teachers SET school_id = (SELECT min(id) FROM schools) WHERE school_id IS NULL;
UPDATE teachers SET role = 'school_admin' WHERE id = (SELECT min(id) FROM teachers);

UPDATE classes c SET school_id = t.school_id FROM teachers t WHERE t.id = c.teacher_id;

UPDATE classes SET
  standard = substring(name from '^([0-9]{1,2})')::int,
  division = upper(coalesce(substring(name from '^[0-9]{1,2}\\s*-{0,1}\\s*([A-Za-z])$'), ''))
WHERE name ~ '^[0-9]{1,2}\\s*-{0,1}\\s*[A-Za-z]{0,1}$'
  AND substring(name from '^([0-9]{1,2})')::int BETWEEN 1 AND 12;

UPDATE classes SET academic_year = CASE
  WHEN substring(start_date, 6, 2)::int >= 6
    THEN substring(start_date, 1, 4) || '-' || lpad(((substring(start_date, 1, 4)::int + 1) % 100)::text, 2, '0')
  ELSE (substring(start_date, 1, 4)::int - 1)::text || '-' || substring(start_date, 3, 2)
END;

UPDATE students s SET first_login_at = x.first, last_login_at = x.last
  FROM (SELECT student_id, min(created_at) AS first, max(created_at) AS last
          FROM auth_tokens WHERE student_id IS NOT NULL GROUP BY student_id) x
 WHERE x.student_id = s.id;
UPDATE students s SET first_login_at = x.first
  FROM (SELECT student_id, min(started_at) AS first FROM sessions GROUP BY student_id) x
 WHERE x.student_id = s.id AND s.first_login_at IS NULL;

UPDATE words w SET school_id = t.school_id FROM teachers t WHERE w.source = 'teacher' AND t.id = w.created_by;

ALTER TABLE teachers ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE classes  ALTER COLUMN school_id SET NOT NULL;

-- ---------------------------------------------------------------- new tables
CREATE TABLE invites (
  id                    integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code                  text NOT NULL UNIQUE,          -- 8 chars A-Z2-9 without 0/O/1/I, stored without dash
  kind                  text NOT NULL CHECK (kind IN ('school_admin','teacher','password_reset')),
  school_id             integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id            integer REFERENCES teachers(id) ON DELETE CASCADE,       -- password_reset target
  created_by_teacher_id integer REFERENCES teachers(id) ON DELETE SET NULL,      -- NULL = super admin / system
  max_uses              integer,                       -- NULL = unlimited (teacher); 1 for setup/reset
  use_count             integer NOT NULL DEFAULT 0,
  expires_at            text NOT NULL,
  revoked_at            text,
  created_at            text NOT NULL DEFAULT iso_now(),
  CHECK (kind <> 'password_reset' OR teacher_id IS NOT NULL)
);

CREATE TABLE rate_limits (
  key          text NOT NULL,                          -- '<bucket>:<sha256(ip) first 16 hex>[:extra]'
  window_start text NOT NULL,                          -- ISO minute that starts the 10-minute window
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE audit_log (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  school_id   integer REFERENCES schools(id) ON DELETE CASCADE,  -- NULL only for super-admin actions without a school
  actor_type  text NOT NULL CHECK (actor_type IN ('super','teacher','student','system')),
  actor_id    integer,                                 -- teachers.id / students.id; NULL for super/system
  action      text NOT NULL,                           -- see API spec 4.9
  target_type text,                                    -- 'school' | 'teacher' | 'class' | 'student' | 'invite'
  target_id   integer,
  meta_json   text NOT NULL DEFAULT '{}',              -- ids and counts only, never names or PINs
  created_at  text NOT NULL DEFAULT iso_now()
);

-- ---------------------------------------------------------------- indexes
CREATE INDEX teachers_school_idx     ON teachers(school_id);
CREATE INDEX classes_school_idx      ON classes(school_id, archived);
CREATE INDEX classes_teacher_idx     ON classes(teacher_id);
CREATE INDEX auth_tokens_teacher_idx ON auth_tokens(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX auth_tokens_student_idx ON auth_tokens(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX auth_tokens_expires_idx ON auth_tokens(expires_at);
CREATE INDEX invites_school_kind_idx ON invites(school_id, kind) WHERE revoked_at IS NULL;
CREATE INDEX rate_limits_window_idx  ON rate_limits(window_start);
CREATE INDEX audit_log_school_idx    ON audit_log(school_id, id DESC);
CREATE INDEX words_school_idx        ON words(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX sessions_student_date_completed_idx ON sessions(class_id, date) WHERE completed_at IS NOT NULL;
`,
  },
```

Notes:
- Inside the TS template literal, `\\s` produces `\s` in SQL (standard_conforming_strings is on, so the regex sees `\s`). O1 must check this in a migration test.
- There is **no unique index** on (school, year, standard, division), so backfill cannot fail on legacy duplicates. The server enforces uniqueness on create and reassign (409).
- A fresh, empty database gets no default school. Schools are created through `/api/admin` or the seed.
- Rollback is not supported; v2 is additive, and old code ignores the new columns, except that old code would insert classes and teachers without `school_id` (NOT NULL). So **deploy the server and the migration together** (they ship in one Vercel deploy, and migration runs first per DEPLOY.md).

### 3.3 Codes

| Code | Format | Entropy | Where |
|---|---|---|---|
| Class join code `classes.class_code` | 6 characters `K7Q2MX` | 30 bits | `/j/K7Q2MX`, cards, QR |
| School student code `schools.student_code` | 6 characters | 30 bits | `/s/DEMSCH`, poster |
| Invite code `invites.code` | 8 characters, shown as `ABCD-EFGH` | 40 bits | `/t/`, `/a/`, `/r/` + typed |

Alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`generateClassCode`'s), generated with `node:crypto randomInt`. Input normalisation (core `normalizeCode`): uppercase, strip everything except `A-Z0-9`. A normalised code containing `0`, `O`, `1` or `I` is invalid (we never generate those characters), except legacy class codes such as `DEMO5A`, which are looked up as typed. Expiry defaults: school setup 14 days (single use), teacher invite 30 days (unlimited uses; admin can set 1-90 days and a max-uses count), password reset 24 hours (single use).

---

## 4. API changes

The conventions in API.md stay: JSON bodies, `{error:{code,message}}`, bearer tokens, 404 for anything outside your scope. **New error code:** `rate_limited` (429), with `message` safe to show. Add it to `ApiErrorCode` in core.
**Public URL base:** the server env `PUBLIC_APP_URL` (required in production, for example `https://shabd-mitra.vercel.app`). Without it, the server falls back to `x-forwarded-proto` + `x-forwarded-host`/`host`. Every `url` / `joinUrl` field is absolute.

### 4.1 Core types (frozen by O1 in `packages/core/src/types.ts` + `api.ts`)

```ts
// types.ts (additive)
export type StaffRole = 'teacher' | 'school_admin';
export interface School { id: number; name: string; district: string; studentCode: string; status: 'active' | 'suspended' }
export interface Teacher { id: number; name: string; email: string; schoolId: number; role: StaffRole; active: boolean }
export interface ClassRoom {            // existing fields kept: id, teacherId, name, classCode, startDate, leaderboardMode
  schoolId: number; standard: number; division: string; academicYear: string;
  archived: boolean; joinEnabled: boolean; linkSharedAt: string | null; consentAttestedAt: string | null;
}
export interface RosterStudent extends StudentWithPin { firstLoginAt: string | null; lastLoginAt: string | null; locked: boolean }

// api.ts
export type ApiErrorCode = /* existing */ | 'rate_limited';
export type InviteKind = 'school_admin' | 'teacher' | 'password_reset';
export interface Invite { id: number; kind: InviteKind; code: string /* 'ABCD-EFGH' */; url: string; expiresAt: string;
  maxUses: number | null; useCount: number; revokedAt: string | null; createdAt: string }
export interface InviteInfoRes { kind: InviteKind; schoolName: string; expiresAt: string; teacherName?: string /* reset only */ }

export interface TeacherRegisterReq { inviteCode: string; name: string; email: string; password: string } // inviteCode now REQUIRED
export interface SchoolSetupReq { code: string; name: string; email: string; password: string }
export interface PasswordResetReq { code: string; password: string }
export interface TeacherAuthRes { token: string; teacher: Teacher; school: Pick<School, 'id' | 'name'> }
export type MeRes =
  | { role: 'teacher'; teacher: Teacher; school: Pick<School, 'id' | 'name'> }
  | { role: 'student'; student: Student; classRoom: Pick<ClassRoom, 'id' | 'name' | 'leaderboardMode'>; schoolName: string };

export interface JoinStudent { id: number; firstName: string; avatar: string; rollNo: number }
export interface JoinClassRes { schoolName: string; classRoom: { name: string; classCode: string }; students: JoinStudent[] }
export interface JoinSchoolRes { schoolName: string; classes: { name: string; classCode: string; standard: number; division: string }[] }
export interface StudentAuthRes { token: string; student: Student; className: string; schoolName: string; classCode: string; firstLogin: boolean }
/** @deprecated kept for cached old clients */ export interface PublicRosterRes { className: string; students: Pick<Student, 'id' | 'firstName' | 'avatar'>[] }

export interface CreateClassReq { standard?: number; division?: string; name?: string; startDate?: IsoDate } // standard or name required
export interface UpdateClassReq { name?: string; startDate?: IsoDate; leaderboardMode?: LeaderboardMode;
  joinEnabled?: boolean; archived?: boolean; linkShared?: true }
export interface AddStudentsReq { students: { rollNo: number; firstName: string }[]; consentConfirmed?: boolean }
export type RosterRes = RosterStudent[];
export interface ResetPinReq { signOutDevices?: boolean }   // default true
export interface ShareInfoRes { joinUrl: string; schoolJoinUrl: string; classCode: string; whatsappText: string }

export interface ClassSummary extends ClassRoom { studentCount: number; joinedCount: number; completedToday: number; teacherName: string }
export interface TeacherChecklist { classCreated: boolean; studentsAdded: boolean; linkShared: boolean; firstStudentJoined: boolean; done: boolean }
export interface TeacherOverviewRes { teacher: Teacher; school: Pick<School, 'id' | 'name'>; date: IsoDate; classes: ClassSummary[]; checklist: TeacherChecklist }

export interface SchoolChecklist { teacherLinkShared: boolean; firstTeacherJoined: boolean; firstClassCreated: boolean; firstStudentPlayed: boolean; done: boolean }
export interface SchoolInfoRes { school: School; studentJoinUrl: string; teacherInvite: Invite | null; checklist: SchoolChecklist }
export interface UpdateMySchoolReq { name?: string; district?: string; teacherLinkShared?: true }
export interface SchoolClassRow { classId: number; name: string; standard: number; division: string; teacherId: number; teacherName: string;
  teacherActive: boolean; studentCount: number; joinedCount: number; completedToday: number; weekCompletionPct: number; archived: boolean; joinEnabled: boolean }
export interface SchoolOverviewRes { date: IsoDate; totals: { teachers: number; classes: number; students: number; joined: number; completedToday: number };
  classes: SchoolClassRow[] }
export interface SchoolTeacherRow { id: number; name: string; email: string; role: StaffRole; active: boolean; classCount: number; lastLoginAt: string | null }
export interface UpdateSchoolTeacherReq { active?: boolean; role?: StaffRole }
export interface CreateInviteReq { expiresInDays?: number /* 1-90, default 30 */; maxUses?: number | null }
export interface UpdateSchoolClassReq { teacherId?: number; archived?: boolean }
export interface AuditEntry { id: number; at: string; actorType: 'super' | 'teacher' | 'student' | 'system'; actorName: string | null;
  action: string; targetType: string | null; targetId: number | null; targetLabel: string | null; meta: Record<string, unknown> }

export interface AdminSchoolRow { school: School; udiseCode: string | null; teachers: number; classes: number; students: number; createdAt: string }
export interface CreateSchoolReq { name: string; district?: string; udiseCode?: string }
export interface CreateSchoolRes { school: School; setupInvite: Invite; whatsappText: string }
export interface AdminUpdateSchoolReq { name?: string; district?: string; status?: 'active' | 'suspended' }
```

Core helpers (new `packages/core/src/codes.ts`, exported from index):
`CODE_ALPHABET`, `normalizeCode(s): string`, `formatInviteCode('ABCDEFGH') → 'ABCD-EFGH'`, `isValidInviteCode(s)`, `academicYearFor(isoDate) → '2026-27'`, `className(standard, division) → '5A'`, `joinPath(classCode) → '/j/K7Q2MX'`, `schoolJoinPath`, `invitePath(kind, code)` (`/a/`, `/t/`, `/r/`), and the text builders `classJoinText({schoolName, className, url})`, `teacherInviteText({schoolName, url, code, expiresAt})`, `schoolSetupText({schoolName, url, expiresAt})`, `resetText({teacherName, url})`. The server and the UI use the same builders, so the WhatsApp texts never drift.

### 4.2 Auth changes in `server/src/auth.ts`

- `TeacherAuth` becomes `{ role: 'teacher'; teacherId; schoolId; staffRole: StaffRole; token }`. `StudentAuth` adds `schoolId`.
- `attachAuth` joins `teachers`/`schools` (teacher tokens) and `students → classes → schools` (student tokens). It rejects (leaves `req.auth` unset) when the teacher has `active = 0`, the student has `active = 0`, the class is archived, or the school is `suspended`.
- **Sliding renewal:** when a valid token's `last_used_at` is NULL or older than 24 hours, run `UPDATE auth_tokens SET last_used_at = now, expires_at = now + N days` (N = 7 for teachers, 60 for students). At most one write per token per day. Also update `students.last_login_at` / `teachers.last_login_at` at that point.
- Opportunistic cleanup: on about 1 in 100 requests, `DELETE FROM auth_tokens WHERE expires_at < now` and `DELETE FROM rate_limits WHERE window_start < now - 1 day`.
- New `server/src/tenancy.ts` replaces `assertTeacherOwnsClass` / `assertTeacherOwnsStudent` (keep them as wrappers during the change):
  - `assertCanAccessClass(auth, classId)`: passes if `classes.teacher_id = auth.teacherId`, or `auth.staffRole = 'school_admin' AND classes.school_id = auth.schoolId`. Otherwise 404 "Class not found".
  - `assertCanAccessStudent(auth, studentId)`: the same rule through the student's class.
  - `requireSchoolAdmin`: 401 without a staff token, **403** for a plain teacher (they know they are not an admin; nothing leaks).
  - `requireSuperAdmin`: 404 when `SUPER_ADMIN_SECRET` is unset or shorter than 16 characters (the feature is off). Otherwise it compares `X-Admin-Secret` with `timingSafeEqual` on sha256 digests. A failure counts toward the `admin` rate limit and returns 401.
  - Every route in `classes.ts`, `words.ts` and `analytics.ts` switches to these. Custom words: `GET /words` returns bank words plus `school_id = auth.schoolId`. `PUT daily-words` with another school's custom word returns 400 "Unknown word id". `POST /words` stores `school_id`.

### 4.3 Rate limits (`server/src/services/rateLimit.ts`)

`hit(bucket, ipKey, extra?, limit, windowMin = 10)` runs `INSERT … ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count` and throws 429 `rate_limited` over the limit. The IP comes from `x-forwarded-for` (first entry; `app.set('trust proxy', true)`) or `req.ip`, stored as `sha256(ip).slice(0,16)`. Tests set `RATE_LIMIT_OFF=1` except in the rate-limit test.

| Bucket | Counts | Limit / 10 min | Message |
|---|---|---|---|
| `join` | every `GET /join/*` and legacy roster lookup | 120 per IP | "Too many tries. Wait a few minutes 🙂" |
| `pin` | **wrong** student PINs | 60 per IP | "Too many tries on this phone. Wait 10 minutes 🙂" |
| `invite` | `GET /invites/:code` + register/setup/reset attempts with a bad code | 20 per IP | "Too many tries. Wait 10 minutes." |
| `tlogin` | failed teacher logins | 10 per IP+email | "Too many tries. Wait 10 minutes or ask your school admin." |
| `admin` | failed super-admin secrets | 5 per IP | "Too many tries." |

The limits are generous because 40 children on one school Wi-Fi share one IP. **PIN lockout interplay:** the per-student lock is unchanged (5 wrong → 423 `locked` for 5 minutes, and a correct PIN resets the counter). The IP limit (`pin`) is checked **before** the PIN comparison, and only wrong PINs count, so a sibling hammering one phone is stopped without locking other children. Teacher **Reset PIN** clears the lock, sets a new PIN and (by default) deletes that student's tokens. Locked students show 🔒 in the roster (`locked: true`).

### 4.4 Public and auth endpoints

| Method & path | Auth | Request → Response | Notes |
|---|---|---|---|
| `GET /join/class/:classCode` | none | → `JoinClassRes` | Case-insensitive. 404 "Class not found" when the code is unknown, the class is archived, `join_enabled = 0` or the school is suspended (the same message for all). Active students ordered by `lower(first_name), roll_no`. RL `join`. |
| `GET /join/school/:studentCode` | none | → `JoinSchoolRes` | Non-archived, join-enabled classes of the school, ordered by standard then division. RL `join`. |
| `GET /auth/classes/:classCode/roster` | none | → `PublicRosterRes` | **Kept** (deprecated alias) with the same 404 rules and RL. |
| `POST /auth/student/login` | none | `StudentLoginReq` → `StudentAuthRes` | Same lockout. Adds `schoolName`, `classCode` and `firstLogin` (true when `first_login_at` was NULL; set it now). Sets `last_login_at`. Archived class, disabled join or suspended school → 404. **A disabled join link blocks new logins only**; existing tokens keep working. |
| `GET /invites/:code` | none | → `InviteInfoRes` | 404 "This code is not valid. Ask for a new one." for unknown, expired, revoked or used-up codes, or a suspended school (identical message). RL `invite`. |
| `POST /auth/school/setup` | none | `SchoolSetupReq` → 201 `TeacherAuthRes` | The invite must be kind `school_admin`. In one transaction: create the teacher (`role school_admin`), `use_count + 1`, create the school's first **teacher invite** (30 days), and write audit rows. Duplicate email → 409 "This email is already registered. Log in instead." |
| `POST /auth/teacher/register` | none | `TeacherRegisterReq` → 201 `TeacherAuthRes` | `inviteCode` **required**, kind `teacher` (a `school_admin` code is also accepted and makes an admin). Missing → 400. Invalid → 404 (as above). The global `TEACHER_INVITE_CODE` is **gone** (the env var is ignored; DEPLOY.md says to delete it). |
| `POST /auth/teacher/login` | none | unchanged → `TeacherAuthRes` | Inactive teacher → 403 `forbidden` "Your account is turned off. Ask your school admin." Suspended school → 403 "Your school is paused. Contact Shabd Mitra." RL `tlogin` on failure. |
| `POST /auth/password-reset` | none | `PasswordResetReq` → `TeacherAuthRes` | Kind `password_reset`, single use. Sets the password, **deletes all the teacher's tokens**, then issues a new one. |
| `GET /auth/me` | any | → `MeRes` | Includes `school` / `schoolName`. |
| `POST /auth/logout` | any | 204 | unchanged |

### 4.5 Teacher endpoints (staff token; a school admin passes the class checks for their whole school)

| Method & path | Request → Response | Notes |
|---|---|---|
| `GET /teacher/overview` | → `TeacherOverviewRes` | The teacher's own non-archived classes with counts. Checklist: `classCreated` (≥1 class), `studentsAdded` (≥1 student), `linkShared` (any class `link_shared_at` set), `firstStudentJoined` (any student `first_login_at`). |
| `GET /classes` | → `ClassRoom[]` | Unchanged: own classes only (also for admins; they use `/school/classes` for all). Add `?archived=1` to include archived ones. |
| `POST /classes` | `CreateClassReq` → 201 `ClassRoom` | Uses `standard` (1-12) + `division` (`^[A-Za-z0-9]{0,3}$`, uppercased). `name` defaults to `className(standard, division)`. A legacy `{name}` only is parsed with the same regex as the backfill (otherwise standard 5, division ''). `academic_year = academicYearFor(startDate)`. 409 when a non-archived class with the same standard + division + year exists in the school. Audit `class.create`. |
| `PATCH /classes/:id` | `UpdateClassReq` → `ClassRoom` | `joinEnabled`, `archived` (the owner or an admin), `linkShared: true` (sets `link_shared_at` once). |
| `POST /classes/:id/rotate-code` | → `ClassRoom` | New `class_code` (retry on a clash). Existing student tokens are unaffected. Audit `class.code_rotate`. |
| `GET /classes/:id/share` | → `ShareInfoRes` | Built from `PUBLIC_APP_URL` and core `classJoinText`. |
| `GET /classes/:id/students` | → `RosterRes` | Now `RosterStudent[]`. |
| `POST /classes/:id/students` | `AddStudentsReq` → 201 `RosterRes` (created rows) | Limit raised to **100**. `firstName` trimmed, 1-30 characters, and the server also keeps **only the first whitespace-separated word** (defence in depth). `consentConfirmed: true` sets `consent_attested_at/by` if NULL. Audit `students.add {count}`. |
| `PATCH /students/:id` | unchanged | Audit `student.deactivate` when `active` becomes false (also deletes that student's tokens). |
| `POST /students/:id/reset-pin` | `ResetPinReq` (optional body) → `RosterStudent` | New PIN, unlocks, and with `signOutDevices` (default **true**) deletes the student's tokens. Audit `student.pin_reset`. |
| words, daily words, dashboard, leaderboard, analytics, export | unchanged | Switched to `assertCanAccessClass` / `assertCanAccessStudent`. |

### 4.6 School admin endpoints (`requireSchoolAdmin`; always scoped to `auth.schoolId`, with no school id in the URL)

| Method & path | Request → Response | Notes |
|---|---|---|
| `GET /school` | → `SchoolInfoRes` | `teacherInvite` = the newest non-revoked, unexpired teacher invite, or null. Checklist: `teacherLinkShared` (`schools.teacher_link_shared_at`), `firstTeacherJoined` (≥2 teachers, or ≥1 teacher with `role = 'teacher'`), `firstClassCreated`, `firstStudentPlayed` (any session in the school). |
| `PATCH /school` | `UpdateMySchoolReq` → `SchoolInfoRes` | name 1-100, district 0-60. |
| `POST /school/rotate-student-code` | → `SchoolInfoRes` | Audit. |
| `GET /school/overview?date=` | → `SchoolOverviewRes` | `weekCompletionPct` = completed sessions Mon..date ÷ (active students × weekdays Mon..date) × 100, rounded. Archived classes are excluded. |
| `GET /school/teachers` | → `SchoolTeacherRow[]` | Admins first, then by name. |
| `PATCH /school/teachers/:id` | `UpdateSchoolTeacherReq` → `SchoolTeacherRow` | Another school's teacher id → 404. Demoting or turning off the last active admin → 409 "Your school needs at least one admin." Turning a teacher off deletes their tokens. Audit `teacher.deactivate` / `teacher.activate` / `teacher.role_change`. |
| `POST /school/teachers/:id/reset-link` | → `Invite` (+ `whatsappText` field) | Kind `password_reset`, 24 hours, single use. It revokes earlier unused reset links for that teacher. An admin cannot use it on themselves; they use the super admin's new setup link instead. |
| `GET /school/invites` | → `Invite[]` | Teacher invites, newest first, including revoked ones (for history). |
| `POST /school/invites` | `CreateInviteReq` → 201 `Invite` | Makes a new teacher invite and **revokes the previous active ones** (one live code per school keeps the UI simple). |
| `DELETE /school/invites/:id` | → 204 | Revoke. |
| `GET /school/classes` | → `ClassSummary[]` | All classes in the school (`?archived=1` to include archived). |
| `PATCH /school/classes/:id` | `UpdateSchoolClassReq` → `ClassSummary` | `teacherId` must be an active teacher of the same school (otherwise 400). Uniqueness is re-checked. Audit `class.reassign` / `class.archive`. |
| `GET /school/audit?limit=50&before=<id>` | → `AuditEntry[]` | `actorName` and `targetLabel` are resolved at read time (teacher name; student first name + roll), so the log table itself holds no names. |

### 4.7 Super admin endpoints (`X-Admin-Secret` header; off when the env var is unset)

| Method & path | Request → Response |
|---|---|
| `GET /admin/schools` | → `AdminSchoolRow[]` |
| `POST /admin/schools` | `CreateSchoolReq` → 201 `CreateSchoolRes` (the school plus a 14-day single-use `school_admin` invite). UDISE: `^\d{11}$` if given. |
| `POST /admin/schools/:id/setup-link` | → 201 `Invite` (+ `whatsappText`) |
| `PATCH /admin/schools/:id` | `AdminUpdateSchoolReq` → `AdminSchoolRow`. Suspending deletes every token in that school. |

CLI: `npm run admin -- create-school --name "ZP School Kalwa" [--district Thane] [--udise 27…]`, `npm run admin -- setup-link --school <id>` and `npm run admin -- list`. File `server/scripts/admin.ts`. It uses `DATABASE_URL` and calls the same `services/schools.ts` functions, then prints the link (built from `PUBLIC_APP_URL`, default `http://localhost:5173`).

### 4.8 Security checklist (O2 must test every line)

- **Tenant isolation:** a matrix test with 2 schools × (admin, teacher) shows that every class, student, word, export, school and invite endpoint returns 404 across schools, and that a plain teacher gets 404 on another teacher's class in the same school.
- **PII:** no endpoint returns a student surname, phone or email (none are stored). Public endpoints return only the first name, avatar and roll number. `audit_log.meta_json` never contains names or PINs.
- **Codes:** generated with `randomInt`. Invite redemption checks `revoked_at IS NULL AND expires_at > now AND (max_uses IS NULL OR use_count < max_uses)` and increments inside the same transaction with `SELECT … FOR UPDATE`.
- **Expiry:** teacher tokens 7 days sliding, student tokens 60 days sliding. Invites as in 3.3.
- **Revocation:** PIN reset, student deactivation, teacher deactivation, password reset and school suspension delete the relevant tokens immediately.
- The super-admin secret is never logged. Error messages do not reveal whether an email or code exists, beyond the documented 409 on register.

### 4.9 Audit actions

`school.create`, `school.update`, `school.suspend`, `school.resume`, `school.student_code_rotate`, `invite.create`, `invite.revoke`, `invite.redeem`, `teacher.join`, `teacher.activate`, `teacher.deactivate`, `teacher.role_change`, `teacher.password_reset`, `class.create`, `class.archive`, `class.reassign`, `class.code_rotate`, `class.join_toggle`, `students.add`, `student.pin_reset`, `student.deactivate`, `student.lockout` (system, when the 5-minute lock triggers).

---

## 5. UI

### 5.1 Route map (`apps/web/src/App.tsx`, frozen by O1)

| Path | Entry (lane) | Screen |
|---|---|---|
| `/` | StudentApp (O3) | No profiles → `<Landing/>` (O5). One profile → Home. Several → `/who`. |
| `/j/:classCode` | StudentApp | Tap your name |
| `/j/:classCode/pin/:studentId` | StudentApp | PIN pad (+ "Forgot PIN?") |
| `/s/:schoolCode` | StudentApp | Pick your class → `/j/:classCode` |
| `/login` | StudentApp | Type the class code (`#cc`) → `/j/:code` |
| `/who` | StudentApp | Who's playing? |
| `/welcome` | StudentApp | 3-card tutorial |
| `/play`, `/summary`, `/leaderboard` | StudentApp | unchanged |
| `/t/:code` | App redirect → `/teacher/join/:code` | |
| `/teacher/login` (`?next=`) | TeacherApp (O4) | Staff login |
| `/teacher/join`, `/teacher/join/:code` | TeacherApp | Join school |
| `/r/:code` → `/teacher/reset/:code` | TeacherApp | New password |
| `/teacher` | TeacherApp | Home: checklist + class cards |
| `/teacher/classes/new` | TeacherApp | Create class |
| `/teacher/classes/:id/students/add` | TeacherApp | Paste or CSV import |
| `/teacher/classes/:id/share` | TeacherApp | Link + QR + WhatsApp + cards |
| `/teacher/classes/:id/{roster,cards,words,dashboard,leaderboard,analytics}`, `/teacher/students/:id` | TeacherApp | existing (roster and cards upgraded) |
| `/a/:code` → `/school/setup/:code` | SchoolApp (O5, lazy) | School setup |
| `/school`, `/school/teachers`, `/school/classes`, `/school/settings` | SchoolApp | Admin screens. Guard: a staff token with `role = 'school_admin'`; otherwise → `/teacher/login?next=/school` (no token) or a "This page is for school admins" page with a link to `/teacher`. |
| `/admin` | AdminApp (O5, lazy) | Super admin |

Bundles: Landing and the student onboarding live in the student chunk, which must stay **under 150 KB gzipped** (CI check in O6). `/teacher`, `/school` and `/admin` are lazy chunks. `qrcode-generator` is only reachable from `shared/qr.tsx`, which is imported only by teacher and school code.

### 5.2 Client storage and tokens (contract in `shared/api.ts`, O1)

- Two token slots: `getToken('student' | 'staff')` / `setToken(scope, token | null)`, with keys `shabd.token.student` (the **active** profile's token) and `shabd.token.staff`. Each `api.*` method has a fixed scope: `/student/*` and `studentLogin` use student; teacher, school, `teacherLogin` and the like use staff. `api.me(scope)` takes an explicit scope.
- `api.withToken(token)` returns the same client bound to an explicit token. The outbox uses it.
- 401 handling per scope: student → clear the active student token, `dispatchEvent(new CustomEvent('shabd:student-unauthorized'))`, and O3 marks the profile "needs PIN" and routes to `/who` or the PIN pad. Staff → clear the staff token → `/teacher/login?next=<current path>`.
- Admin secret: `sessionStorage['shabd.adminSecret']`, sent by `api.admin.*` as `X-Admin-Secret`.
- **Legacy migration** (runs once in `api.ts` module init): if the old `shabd.token` exists, move it to the student slot if `shabd.student` exists, otherwise to the staff slot, then delete the old key. O3 then turns a lone student token plus `shabd.student` into the first profile.
- Student profiles (`student/profiles.ts`, O3): `localStorage['shabd.profiles.v1'] = Profile[]` where `Profile = { studentId, firstName, avatar, className, schoolName, classCode, token: string | null, lastUsedAt }`, plus `shabd.activeStudentId`. Switching profiles writes `setToken('student', p.token)`. Home cache becomes per-student: `shabd.home.<studentId>`.
- **Outbox safety (critical):** every outbox item gains `studentId`. `flush` sends each item with `api.withToken(profileToken(item.studentId))`. Items whose profile has no token stay queued until that child logs in again, and are never sent with another child's token. Old items without a `studentId` are assigned to the active profile once, on upgrade.

### 5.3 Screen specs: student (O3)

All student screens use `.screen.student-screen`, keep one task per screen, have a back arrow top-left (except Home), and a 🔊 button that reads the screen's instruction with `speak()`.

| Screen | Content | Empty and error states |
|---|---|---|
| Landing (O5 component, shown by O3) | 🦜 logo, "Shabd Mitra", "5 new English words every day". Three tiles, full width, at least 96 px tall, icon + label: **🎒 I'm a Student** → `/login`; **👩‍🏫 I'm a Teacher** → `/teacher/login`; **🏫 My School** → `/teacher/login?next=/school`. Small footer: "New school? {VITE_CONTACT_TEXT}". | |
| `/login` | "Type your class code" (from your card), one field `#cc` (6 characters, `autocapitalize=characters`), **Next ▶**, and a picture hint showing where the code is on the card. | 404: "We can't find that class. Check the code 🙂". Network: "No internet. Try again 🙂". |
| `/j/:code` | Class and school header, 🔊 "Find your name", name grid, letter chips over 24 students, a WhatsApp-webview banner (section 2.4). | 404: big 🤔 "This link is not working. Ask your teacher for a new one 🙂" + **Type a class code** → `/login`. No students: "Your teacher is still adding names. Come back soon 🙂". |
| PIN pad | Avatar and name, 4 dots, 3×4 keypad (72 px keys), "Forgot PIN? 🙋". | Wrong: wobble + "Try again 💪" (never red). 423: "Too many tries. Wait 5 minutes 🙂". 429: the message from the server. |
| Forgot PIN | 🙋 "Ask your teacher for your PIN card 🙂" + **Back**. | |
| `/s/:code` | "Pick your class", tiles 5A, 5B… | 404 as for `/j`. No classes: "No classes yet. Ask your teacher 🙂". |
| `/who` | "Who's playing? 🦜", avatar tiles, **+ Add a player**, **Edit**. | A profile needing its PIN shows a small 🔑 badge. |
| `/welcome` | 3 cards (section 2.4), progress dots, Skip. | Speech unsupported: the cards still work without sound. |
| Install card | Section 2.4. | |

Kids' design rules (in addition to UI_SPEC section 2):
- Instructions are at most 6 words and readable at Std 3 level. Every instruction has a 🔊 button.
- Tap targets are at least 64 px (keypad 72 px), with 12 px gaps. No text input except the class-code fallback.
- No red, no ✗ for children's mistakes. Use `--c-warn` with "Try again 💪".
- Never show another child's PIN or score on onboarding screens. The name grid shows names only.
- Every error message tells the child **who to ask**: "Ask your teacher" or "Ask a grown-up".
- Everything works at 320 px wide without horizontal scroll, and in a WhatsApp webview.

### 5.4 Screen specs: teacher (O4) and school/admin (O5)

These screens follow section 2.3 and 2.2 and use the existing `.teacher` styles (`ui.tsx` `Page`, `SortTable`). New shared pieces:
- `<Checklist items={[{done, label, action?: {label, to | onClick}}]} />`: done items show ✅ and are struck through, and the first open item is highlighted as **Next**. O4 owns `teacher/Checklist.tsx`. O5 copies the pattern into `school/` (no cross-lane import).
- `<ShareBox url text code qr />` per lane: QR (from `shared/qr.tsx`), large link text, buttons. **WhatsApp** opens `https://wa.me/?text=${encodeURIComponent(text)}`. **Share** uses `navigator.share({text})` when present. **Copy** uses `navigator.clipboard.writeText` with a fallback to select-and-copy, then shows "Copied ✅".
- `shared/qr.tsx` (O1): `export function QrSvg({ text, size = 240, label }: { text: string; size?: number; label: string })`, which renders `qrcode(0, 'M')` → `createSvgTag({ cellSize, margin: 2, scalable: true })` inside `<div role="img" aria-label={label}>`. Pure, synchronous and dependency-free apart from the library.

Teacher and admin copy (simple English):

| Situation | Message |
|---|---|
| Invalid or expired invite | "This code is not valid. Ask your school admin for a new one." |
| Email taken | "This email is already registered. Log in instead." (with a Log in link) |
| Wrong login | "Wrong email or password." |
| Account off | "Your account is turned off. Ask your school admin." |
| Class duplicate | "Class 5A already exists in your school." |
| Paste error | "Line 4: roll number 7 is used twice." / "Line 6: add a name after the number." |
| Nobody joined | "No one has joined yet. Send the link to parents." [WhatsApp] |
| No classes (admin) | "No classes yet. Your teachers will create them." [Share teacher link] |
| No teachers (admin) | "Invite your teachers to get started." [WhatsApp] |
| Teacher off with classes | Badge "Needs a teacher" + [Change teacher] |
| 429 | Server message. |
| Offline | "No internet. Your changes were not saved. Try again." |

Super admin `/admin` (O5): a secret prompt → schools table (name, district, status, counts, created) → **New school** form → result card with `ShareBox` (setup link + `schoolSetupText`). Row actions: New setup link, Suspend/Resume. The page has no navigation to it from the app, and shows `noindex`.

### 5.5 E2E checks to add (O6, `e2e/onboarding.mjs`, Playwright, the same harness as `student-flow.mjs`)

1. Start with a fresh DB and `SUPER_ADMIN_SECRET=test-secret-1234567890`. The `/admin` page creates "Test School" → a setup link appears.
2. A principal (new context) opens `/a/<code>` → fills the form → lands on `/school` with the checklist. Taps WhatsApp (intercept `wa.me` popup) → "Invite your teachers" ✅.
3. A teacher (new context) opens `/t/<code>` → joins in one form → `/teacher` checklist shows "Create your class" as Next.
4. Create class: standard 5, division B → paste `1, Riya Patil\n2 Aarav\nKabir` → the preview shows Riya, Aarav and Kabir (3) with a first-name notice → tick consent → Save → Share page: the QR `svg` is visible, the link contains `/j/`, and Copy works.
5. A student at **360×740** (new context) opens `/j/<code>` → taps "Riya" → reads the PIN from the teacher's roster through the API → enters it → `/welcome` shows 3 cards → Let's play → Home. **Reload** → Home directly (remembered).
6. Add a player: Aarav on the same context → `/who` shows 2 tiles → tap Riya → Home shows Riya.
7. Lockout: 5 wrong PINs for Kabir → "Too many tries. Wait 5 minutes" → teacher Reset PIN → the new PIN works.
8. Sign-out on reset: the teacher resets Riya's PIN → the student context reloads → the Riya tile shows 🔑 and tapping it opens the PIN pad.
9. School progress: the principal's `/school` shows 1 class, joined 2/3. Teachers lists the teacher. A reset link generates a `/r/` URL, and the teacher sets a new password with it.
10. Isolation: a second school (via the API) and its teacher token get 404 on the first school's class roster, dashboard and export.
11. The legacy path still works: `student-flow.mjs` (demo seed, `/login` → `#cc` DEMO5A) passes unchanged in behaviour.
12. Bundle budget: after `vite build`, the gzipped student entry chunk plus its static imports must be under 150 KB, and must not include `qrcode-generator`.
13. Landing: a fresh context at `/` shows the 3 tiles. "My School" → `/teacher/login?next=/school`.

---

## 6. Task breakdown for parallel Sonnet agents

### 6.1 Order and dependencies

```
Phase A (blocking, 1 agent):   O1  contracts + DB  ──► frozen commit "contracts: onboarding v2"
Phase B (parallel, 5 agents):  O2 server │ O3 student UI │ O4 teacher UI │ O5 school+admin+landing UI │ O6 e2e+docs (drafting)
Phase C (integration):         O6 runs the full e2e after O2-O5 merge; owners fix their own files
```
- **Frozen after O1:** `packages/core/src/{types,api,codes}.ts`, `apps/web/src/shared/api.ts`, `apps/web/src/shared/qr.tsx`, `apps/web/src/App.tsx`, migration v2, and the URL formats in section 5.1. A change needed later is written in the agent's report and applied by the integrator. Agents do not edit these files.
- UI lanes (O3-O5) develop against **their own `dev-mock.ts`** (`?mock=1`), implementing the new `api.*` methods with fake data, so they do not wait for O2.
- O6 writes the e2e and docs from this spec in Phase B, and runs them in Phase C.

### 6.2 File ownership (no file has two owners)

| Lane | Owns (create or edit) | Must not touch |
|---|---|---|
| **O1** contracts + DB | `server/src/db/migrations.ts` (v2), `server/src/db/seed.ts` (demo school), `server/test/db.test.ts` (migration tests only), `packages/core/src/{types,api,codes,index}.ts`, `packages/core/test/codes.test.ts`, `apps/web/src/shared/api.ts`, `apps/web/src/shared/qr.tsx`, `apps/web/src/App.tsx`, **stubs** `apps/web/src/landing/Landing.tsx`, `apps/web/src/school/SchoolApp.tsx`, `apps/web/src/admin/AdminApp.tsx` (placeholder default exports), `apps/web/package.json` + root `package-lock.json` (adds `qrcode-generator@2.0.4`, exact version) | everything else |
| **O2** server | `server/src/**` except `db/migrations.ts` and `db/seed.ts`; new `server/src/tenancy.ts`, `routes/{join,school,admin}.ts`, `services/{rateLimit,audit,invites,schools}.ts`; `server/scripts/admin.ts`; `server/package.json` (the `admin` script); root `package.json` (the `admin` script only); `server/test/**` except `db.test.ts` (new `onboarding.test.ts`, `tenancy.test.ts`, `ratelimit.test.ts`; update `helpers.ts`, `auth.test.ts`, `roster.test.ts`) | web, core, docs |
| **O3** student UI | `apps/web/src/student/**` (new `Join.tsx`, `PickName.tsx`, `PinPad.tsx`, `PickClass.tsx`, `WhoIsPlaying.tsx`, `Welcome.tsx`, `ForgotPin.tsx`, `InstallPrompt.tsx`, `profiles.ts`; edit `StudentApp.tsx`, `Login.tsx`, `Home.tsx`, `common.tsx`, `dev-mock.ts`, `student.css`, tests), `apps/web/src/shared/{outbox,session-store}.ts` | `shared/api.ts`, `App.tsx`, `landing/**` (renders `<Landing/>` only) |
| **O4** teacher UI | `apps/web/src/teacher/**` (new `Join.tsx`, `ResetPassword.tsx`, `Home.tsx` (replaces `Classes.tsx` at the index route), `Checklist.tsx`, `NewClass.tsx`, `AddStudents.tsx`, `Share.tsx`, `ShareBox.tsx`; edit `Login.tsx` (`?next=`), `Roster.tsx`, `Cards.tsx` (QR), `TeacherApp.tsx`, `ui.tsx` (nav: Share tab, School link for admins), `util.ts` (`parseRosterText` v2 + tests), `dev-mock.ts`, `teacher.css`) | `shared/**`, `school/**` |
| **O5** school + admin + landing | `apps/web/src/school/**` (SchoolApp, Setup, Progress, Teachers, Classes, Settings, Checklist, ShareBox, dev-mock, school.css), `apps/web/src/admin/**`, `apps/web/src/landing/**` | `teacher/**` (links to `/teacher/...` routes only) |
| **O6** e2e + docs + deploy | `e2e/onboarding.mjs`, `e2e/student-flow.mjs`, `scripts/deploy.mjs` (replace `TEACHER_INVITE_CODE` with `SUPER_ADMIN_SECRET` + `PUBLIC_APP_URL`), `scripts/check-bundle.mjs` (new), root `package.json` (`e2e:onboarding`, `check:bundle` scripts only, coordinated with O2 by adding separate keys), `README.md`, `docs/{DEPLOY,API,UI_SPEC,PRD}.md` (PRD: section 2.4 school admin is now in scope) | source code |

The root `package.json` has two editors (O2: `admin`; O6: `e2e:onboarding`, `check:bundle`). Each adds only its own script keys. If both land at once, a rebase resolves it trivially.

### 6.3 Acceptance criteria per lane

**O1**
- `npm run db:migrate` on (a) an empty DB and (b) a v1 DB with demo data both succeed. In (b), all teachers and classes are in "My School", the lowest-id teacher is `school_admin`, class `5A` gets standard 5 / division A / academic year from its start date, students with tokens get `first_login_at`, and running it again is a no-op. Covered by `db.test.ts`.
- The demo seed creates: school "Demo School" (`student_code` `DEMSCH`); `demo@school.test` / `demo1234` as `school_admin`; a teacher invite `TEACHERS` (displayed `TEAC-HERS`, 365 days); class 5A `DEMO5A` (standard 5, A); 10 students with PIN 1234. It prints the `/j/`, `/s/` and `/t/` links.
- Core `codes.ts` has unit tests (normalise, format, validate, academic year boundaries 31 May / 1 June, text builders contain the URL and no PIN).
- `shared/api.ts` exposes every endpoint in section 4 with scoped tokens, `withToken`, and the legacy-token migration. `App.tsx` matches 5.1. The stubs compile. `npm run typecheck` and `npm test` pass (existing tests may only be adjusted for the new types).

**O2**
- Every endpoint in section 4 is implemented as specified, with supertest coverage: the happy path plus each listed error.
- `tenancy.test.ts` covers the full isolation matrix (4.8). `ratelimit.test.ts` covers each bucket's 429 and that the PIN IP limit does not lock other students.
- The PIN reset → token deletion, the deactivation and suspension revocations, and the sliding renewal (at most one write per day) are tested.
- `TEACHER_INVITE_CODE` is no longer referenced in `server/`. `npm run admin -- create-school` prints a working `/a/` link.
- All existing server tests pass (updated to create a school and invite through helpers).

**O3**
- The student journey in 2.4 works in mock mode at 320, 360 and 412 px, with a tap count of at most 6 to Home for a new child (link, name, 4 digits) and 1 for a returning child.
- Profiles: add, switch, remove, needs-PIN state, a maximum of 6. Outbox items are tagged with and sent using their own student's token (unit test: two profiles, queued items, a switch, a flush → the correct token per request).
- The welcome tutorial shows only on `firstLogin`, is skippable, and can be reopened from Home ("How to play"). The install prompt follows 2.4.
- `#cc` stays on `/login`. The student chunk stays under 150 KB gzipped.

**O4**
- A teacher goes from `/t/:code` to a shared class link in at most 10 taps (excluding typing) in mock mode. The checklist reflects `TeacherOverviewRes`.
- `parseRosterText` v2 has unit tests for every format in 2.3 (comma, space, dot, tab, name-only auto roll, header skip, full name → first name, duplicates, blank lines, the 100-row limit, CSV file text with `\r\n`).
- Share: QR renders, and WhatsApp, Copy and Share work, with `linkShared` sent on the first use. Cards: 8 per A4, each with the QR, the short link and the PIN. The roster shows Joined and 🔒.
- `?next=` is allowed only for `/school` and `/teacher` paths.

**O5**
- The landing has 3 tiles, works at 320 px, and adds no dependency to the student chunk.
- School setup, the checklist, progress, teachers (promote, turn off, reset link), classes (reassign, archive) and settings (rotate the student link, poster, activity) all work in mock mode, with every empty state and message in 5.4.
- `/admin`: the secret prompt, create school → share card, new setup link, suspend. The secret lives only in sessionStorage.

**O6**
- `npm run e2e:onboarding` runs checks 1-13 green against dev servers. `npm run e2e` (legacy) is green. `npm run check:bundle` enforces the budget.
- DEPLOY.md: remove `TEACHER_INVITE_CODE`; add `SUPER_ADMIN_SECRET` (at least 16 random characters), `PUBLIC_APP_URL` and optional `VITE_CONTACT_TEXT`; add a new "Part 5: Create your first school" (open `/admin` → create → send the link to the principal) and "Pilot day checklist" (principal sets up → shares the teacher link → teachers create classes → print cards → WhatsApp parents). `deploy.mjs` asks for or generates `SUPER_ADMIN_SECRET`.
- API.md and UI_SPEC.md are updated to match sections 4 and 5. PRD 2.4 / 3.2 are amended (a school admin exists; school dashboards are in scope).

### 6.4 QR library check (done for this spec)

`npm view` (2026-11-21): `qrcode-generator@2.0.4` is MIT, has **no dependencies**, and was published 2025-08-07 (older than two weeks; the project has existed since 2009). Alternatives: `uqr@0.1.3` (MIT, no dependencies, published 2026-04, 0.x), `lean-qr@2.7.4`, and `qrcode@1.5.4` (pulls in `pngjs`, `yargs` and `dijkstrajs`, so it is rejected). Pin the exact version `"qrcode-generator": "2.0.4"`. If its typings are missing, O1 adds `apps/web/src/shared/qrcode-generator.d.ts` (a 6-line declaration). Writing our own QR encoder is rejected: Reed-Solomon coding and masking are about 400 lines of risk for no gain.

---

## 7. Risks and open questions (each has a default; build with the default unless told otherwise)

| # | Question or risk | Recommended default |
|---|---|---|
| R1 | **Sibling impersonation:** a remembered profile opens with one tap and no PIN, so a sibling could play as Riya. | Accept it for the pilot (low stakes, and it maximises ease). The teacher's Reset PIN signs out all phones. If teachers report abuse, add a per-class setting "Ask PIN every time" (Phase 2). |
| R2 | **Parental consent** (PRD US-S1 AC4, US-T1 AC5): per-student consent tracking is not built. | A class-level teacher attestation checkbox (`consent_attested_at`), with paper forms kept by the school. Per-student consent flags are Phase 2, if the ethics committee requires them. **Confirm with the faculty advisor before the pilot.** |
| R3 | Teachers without email, or who prefer a phone number. | Keep email (every Android teacher has Gmail). Login by phone number is Phase 2. Password reset is email-less through the admin's reset link. |
| R4 | **WhatsApp in-app browser:** storage may not persist and the install prompt is unavailable. | Show the "Open in Chrome" banner on first open; the flow still works inside the webview. The QR on the card gives a second route. |
| R5 | Rotating a class code breaks printed cards for new phones. | Rotation only by an explicit button with a warning. Logged-in children are unaffected. |
| R6 | Shared school IP (lab Wi-Fi) hits rate limits. | Generous limits (120 join / 60 wrong PINs per 10 minutes per IP). Tune them as constants in `rateLimit.ts` if pilot logs show 429s. |
| R7 | Academic-year rollover (June). | Manual: the admin archives old classes and teachers create new ones. Promotion and carry-over are Phase 2. |
| R8 | Share links pointing at a Vercel preview URL. | `PUBLIC_APP_URL` is required in production. The server logs a warning at start when `VERCEL_ENV=production` and it is unset. |
| R9 | The deploy order: old code cannot insert rows after migration v2 (`school_id` NOT NULL). | Migrate immediately before the deploy that contains O2, which is the same release (DEPLOY.md step). There is no zero-downtime requirement for the pilot. |
| R10 | Losing the super-admin secret, or a school losing its only admin. | Rotate the env var in Vercel. Make a new setup link from `/admin` (or with the CLI) for a new or the same principal. |
