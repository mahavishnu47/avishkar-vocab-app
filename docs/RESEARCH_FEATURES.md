# Research Features: "Word-a-Day" study support for Shabd Mitra

Status: plan (no code written). Author: product/engineering analysis, 2026-11-21.
Study: *Word-a-Day: Effectiveness of a Digital Vocabulary Learning Application in Enhancing Vocabulary Competency Among Grade V Students* (Avishkar). One-group pre-test/post-test (optional comparison class), 30-40 Grade V students, 20 school days, 5 words/day (100 words), 15-20 min/day. Outcome: a 30-mark test, 3 skills x 10 marks: (A) word meanings, (B) parts of speech, (C) sentence construction. Different but comparable pre and post forms.

The research must show a **measured difference** (pre vs post, paired t-test), and answer two judge questions: *"How do you know students are not copying?"* and *"How do you measure improvement?"*

---

## 1. Summary table

| ID | Feature | Priority | Wave | Size | Migration |
|---|---|---|---|---|---|
| W0 | Research scaffold (stubs, slots, contract edits) | prerequisite | 0 | S | none (registers empty M0004-M0010) |
| F1 | Study setup, anonymous study IDs, consent and comparison group | P0 | 1 | M | 4 |
| F3 | Part-of-speech activity in the daily flow | P0 | 1 | M | 6 |
| F4 | Assessment module (timed pre/post test, auto + manual marking) | P0 | 1 | L | 7 |
| F2 | 100-word study plan and school-day calendar | P0 | 2 | M | 5 |
| F5 | Sentence authenticity (anti-copying) signals | P1 | 2 | M | 8 |
| F6 | Recall challenge and My Vocabulary Bank | P1 | 2 | M | 9 |
| F9 | Observation checklist and feedback questionnaire | P1 | 2 | M | 10 |
| F7 | Vocabulary Progress Tracker and participation record | P1 | 3 | S | none |
| F8 | Study results dashboard and one-click research export | P0 | 3 | L | none |

Order of importance for the study's validity: F4 > F1 > F8 > F2 > F3 > F5 > F6 > F9 > F7.
If time runs out, F4 + F1 + F8 alone already produce a valid pre/post study (paper instruments can stand in for F9, the existing CSV export for F7).

---

## 2. What already exists (verified in the code)

| Area | Exists | File(s) |
|---|---|---|
| Daily flow | 5 words/day, stages spell -> learn -> meaning check (3 options) -> write sentence; no part-of-speech activity, no revision of earlier words | `apps/web/src/student/Play.tsx`, `play-logic.ts` (`Stage = 'spell'\|'learn'\|'check'\|'write'\|'summary'`) |
| POS shown | Only as a chip on the learn card (`Play.tsx` line ~249) and to choose the "Help me start" starter | `Play.tsx`, `packages/core/src/sentence.ts#starterFor` |
| Sentence scoring | Rule evaluator: rubric use/grammar/relevance/length (0-40), gates, `SN_COPIED` when Jaccard >= 0.6 with the example sentence, confidence 0..1; optional Claude refinement | `packages/core/src/sentence.ts`, `server/src/services/sentenceEvaluator.ts` |
| Anti-paste | Custom on-screen keyboard (no native input, so no paste) | `apps/web/src/shared/OnScreenKeyboard.tsx` |
| Timing data | `ms_elapsed` on spell attempts and sentence submissions; meaning check sends `msElapsed: 0` | `server/src/db/migrations.ts` v1, `Play.tsx` |
| Word bank | 1830 words, `dayIndex` 1..366. Days 1-20 = exactly 100 words: 45 nouns, 30 adjectives, 20 verbs, **5 adverbs** (bank total only 31 adverbs) | `content/words/part-0*.json` |
| Daily words | Auto set = bank words with `day_index = dayIndexFor(class.startDate, date)`; **calendar days, so weekends consume words** (a Mon-Fri class gets only ~70 of the first 100 words in 4 weeks). Teacher override per date | `server/src/services/dailySet.ts`, `packages/core/src/dates.ts#dayIndexFor`, `server/src/routes/words.ts`, `apps/web/src/teacher/Words.tsx` |
| Consent | Class-level teacher attestation only (`classes.consent_attested_at`); per-student consent explicitly deferred (ONBOARDING_SPEC R2) | `docs/ONBOARDING_SPEC.md` 7 R2, migration v2 |
| Teacher analytics | Dashboard (today), leaderboard, per-student error profile, CSV export with roll_no + first_name (API.md 6: "an anonymised research export is out of scope for the MVP") | `server/src/services/analytics.ts`, `apps/web/src/teacher/{Dashboard,Analytics,StudentDetail}.tsx` |
| Assessment, study IDs, observations, feedback, statistics | **None** | - |
| Migrations | Versions 1-3; `server/test/db.test.ts` asserts versions `[1, 2, 3]` exactly (would break every new migration) | `server/src/db/migrations.ts`, `server/test/db.test.ts:85` |
| Router quirks | `classesRouter.use(['/classes','/students','/teacher'], requireTeacher)`, `wordsRouter.use(['/words','/classes/:classId/daily-words'], ...)`, `studentRouter.use('/student', requireStudent)`, `schoolRouter.use('/school', requireSchoolAdmin)` | `server/src/routes/*.ts` |
| Web API client | `request<T>(method, path, body, {scope})` is exported, so new features can have their own client files | `apps/web/src/shared/api.ts` |

Roles: there is no "researcher" login. In this plan the **researcher** is whoever holds a teacher or school-admin login (the class teacher or the student exhibitor sitting with them). Research outputs are anonymised, so they can be handed to the exhibitor safely.

---

## 3. Shared-file hotspots and the conflict-avoidance rule

| Hotspot | Touched by | How conflicts are avoided |
|---|---|---|
| `server/src/db/migrations.ts` | F1-F6, F9 | W0 adds `...M0004, ..., ...M0010` to `MIGRATIONS`, each imported from `server/src/db/migrations/m00NN-*.ts` that exports `export const M00NN: Migration[] = []`. A feature fills **only its own file** (`[{ version: N, name, sql }]`). Empty arrays apply nothing, so stubs are safe. |
| `server/test/db.test.ts` (`toEqual([1,2,3])`) | every migration | W0 changes it to `toEqual(MIGRATIONS.map((m) => m.version))`. |
| `server/src/app.ts` | all server features | W0 registers `researchRouter` (after existing routers) and `studyGateRouter` (before `studentRouter`). `server/src/routes/research/index.ts` already composes one stub router per feature (`studyRouter`, `wordPlanRouter`, ...). Features fill their own router file only. |
| `packages/core/src/types.ts`, `api.ts` (frozen contracts) | F3, F5 | W0 makes the only two contract edits (see W0). All other new types go in per-feature files `packages/core/src/research/<feature>.ts`, pre-created by W0 and pre-exported from `packages/core/src/index.ts`. |
| `apps/web/src/teacher/TeacherApp.tsx`, `teacher/ui.tsx` nav | F1, F2, F4, F5, F7, F8, F9 | W0 registers every route to a stub page component (one file per feature) and adds nav links. Features replace only their stub file. |
| `apps/web/src/student/StudentApp.tsx`, `student/Home.tsx` | F2, F4, F6, F9 | W0 registers lazy routes (`/test/*`, `/recall`, `/bank`, `/feedback`) and renders `<HomeCards home={home} />` in `Home.tsx`; `HomeCards` renders 4 stub cards, one file per feature. |
| `apps/web/src/shared/api.ts` | all web features | Not edited. Each feature creates `apps/web/src/shared/research/<feature>-api.ts` using the exported `request()`. |
| `apps/web/src/student/Play.tsx` | F3 (new stage), F2 (rest-day catch, ~3 lines), F5 (keystroke counting in `WriteStage`) | F3 lands in Wave 1. F2 and F5 edit different functions in Wave 2; merge F5 first, then F2 (trivial). F3 puts its stage UI in a new file `student/PosStage.tsx`. |
| `server/src/routes/student.ts` | F3 (attempts handler), F5 (sentence handler) | Different waves and different handlers. |
| `server/src/services/dailySet.ts` | F2 only | - |
| `packages/core/src/taxonomy.ts` | F3 only (adds POS codes) | - |

Rules for every agent: never use `router.use(...)` without a path in a research router (it would run for every `/api` request); put middleware on each route. Teacher endpoints live under `/studies/...` or `/classes/:classId/...` (both already require a staff token in some routers, so also call `assertCanAccessClass`). Student endpoints live under `/student/...`. Never put a student endpoint under `/students/...` (teacher-only prefix).

Migration numbers (fixed, never reuse): F1 = 4, F2 = 5, F3 = 6, F4 = 7, F5 = 8, F6 = 9, F9 = 10.

---

## 4. Execution plan (waves)

| Wave | Features (parallel, separate git worktrees) | Why grouped | Merge order inside the wave |
|---|---|---|---|
| 0 | W0 scaffold (one agent, ~1-2 h) | Removes every shared-file conflict up front | - |
| 1 | F1, F3, F4 | Disjoint files; F4 keys assessments by class and student, so it needs no F1 code | F1, F4, F3 |
| 2 | F2, F5, F6, F9 | F2/F9 need F1's `studies` tables; F5 reads F4's responses; F6 reads F3's POS data | F9, F6, F5, F2 (F2 last: small `Play.tsx` hunk) |
| 3 | F7, F8 | Read everything above | F7, F8 |

After each wave: `npm run typecheck`, `npm test` with a fresh `TEST_DB_NAME`, `npm run build && npm run check:bundle` (student bundle must stay <= 150 KB gzipped: every new student page is lazy-loaded; Home cards stay tiny).

Each agent in a wave uses its own `TEST_DB_NAME` (e.g. `shabd_test_f1`) so parallel server test runs do not wipe each other.

Calendar fit: Wave 0 day 1; Wave 1 days 1-4; Wave 2 days 4-7; Wave 3 days 7-9. The **pre-test must run before study day 1**, so F1 + F4 are the critical path; F8 can be finished during the 4 study weeks.

---

## 5. Feature specifications

### W0. Research scaffold (prerequisite)

Not a feature; it creates the empty slots that let 9 agents work without touching the same lines. Detailed list in the W0 agent brief (section 6).

---

### F1. Study setup, anonymous study IDs, consent and comparison group (P0, M, migration 4)

**Serves:** design (one-group pre/post, optional comparison class), ethics (parental consent, confidentiality, anonymous IDs S01...), every export.

**Exists:** schools/classes/students, class-level `consent_attested_at`, `audit_log`. **Missing:** a study entity, per-student consent, study codes, group labels, withdrawal.

**User stories**
- Teacher: "I create the study 'Word-a-Day', add my class 5A as the intervention group (and optionally 5B as comparison), set the start date, and the app gives my students codes S01-S35 in roll order."
- Teacher: "I tick each child whose parent returned the consent form. Children without consent can still use the app, but are left out of all research data."
- Teacher: "I print a code sheet (S01 = roll 1 Riya) to keep in the school file; it is never exported."
- School admin: "I see the school's studies, their status and consent counts (read-only)."
- Researcher: "All my data uses S01/C01 codes only."
- Student: nothing visible (codes are not shown to children).

**Acceptance criteria**
1. Staff can create a study in their school: name, start date, `schoolDays` (default 20), `wordsPerDay` (5), status `setup|running|closed`.
2. A class can be attached with group `intervention` or `comparison`; a class belongs to at most one non-closed study.
3. Codes: intervention students `S01, S02, ...`, comparison `C01, ...`, assigned by roll number; adding students later appends the next code; codes never change or get reused, even after deactivation.
4. Per-student consent: `pending|given|declined|withdrawn` plus `excluded` (teacher's choice, e.g. long absence). Only `given` and not excluded are "analysable".
5. Withdrawal: "Delete research data for this child" removes their F4/F9 research rows (confirm dialog, audit `study.withdraw`), keeps the app usage rows needed for the class.
6. Teacher sees only studies containing their classes; a school admin sees all in the school; other schools get 404.
7. Audit entries (ids only): `study.create`, `study.update`, `study.consent`, `study.withdraw`.
8. Service `getStudyForClass(db, classId)` returns `{ studyId, group, startDate, schoolDays, status } | null` (used by F2, F4, F7, F8, F9).

**Data model (migration 4, `server/src/db/migrations/m0004-study.ts`)**
```sql
CREATE TABLE studies (id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL, start_date text NOT NULL, school_days integer NOT NULL DEFAULT 20 CHECK (school_days BETWEEN 1 AND 60),
  words_per_day integer NOT NULL DEFAULT 5, status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','running','closed')),
  created_by integer REFERENCES teachers(id) ON DELETE SET NULL, created_at text NOT NULL DEFAULT iso_now());
CREATE TABLE study_classes (study_id integer NOT NULL REFERENCES studies(id) ON DELETE CASCADE, class_id integer NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  grp text NOT NULL CHECK (grp IN ('intervention','comparison')), PRIMARY KEY (study_id, class_id));
CREATE TABLE study_participants (study_id integer NOT NULL REFERENCES studies(id) ON DELETE CASCADE, student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  study_code text NOT NULL, consent text NOT NULL DEFAULT 'pending' CHECK (consent IN ('pending','given','declined','withdrawn')),
  excluded integer NOT NULL DEFAULT 0, consent_updated_at text, consent_updated_by integer REFERENCES teachers(id) ON DELETE SET NULL,
  PRIMARY KEY (study_id, student_id), UNIQUE (study_id, study_code));
```
**API** (`server/src/routes/research/study.ts`): `GET /studies`, `POST /studies`, `GET /studies/:studyId`, `PATCH /studies/:studyId`, `PUT /studies/:studyId/classes/:classId {group}`, `DELETE /studies/:studyId/classes/:classId`, `GET /studies/:studyId/participants`, `POST /studies/:studyId/participants/sync`, `PATCH /studies/:studyId/participants/:studentId {consent?, excluded?}`, `DELETE /studies/:studyId/participants/:studentId/research-data`.

**UI:** `apps/web/src/teacher/research/StudyPages.tsx` (route `/teacher/study/*`): study list, create form, study home (links to Words plan, Tests, Observations, Results), participants table with consent toggles and a printable code sheet.

**Depends on:** W0. **Hotspots:** none beyond W0 slots.

**Tests:** server `server/test/research-study.test.ts` (create, attach classes, code assignment and append, consent, tenancy 404 for another school, withdrawal deletes research rows, audit meta has no names). Web: `teacher/research/__tests__/study.test.tsx` (consent toggle calls PATCH; code sheet renders).

**Privacy:** study codes are the only identifiers outside the teacher UI; the code sheet is print-only; `meta_json` ids only.

---

### F2. 100-word study plan and school-day calendar (P0, M, migration 5)

**Serves:** intervention fidelity (100 words, 5/day, 20 school days); "daily vocabulary assignment record" denominators.

**Exists:** `getDailySet` with calendar `dayIndex`; teacher per-date override; word search. **Missing:** school-day mapping (weekends and holidays currently skip words), a fixed 100-word study list with POS balance, a 20-day plan view, blocking daily play for comparison classes.

**User stories**
- Teacher: "I see the 20-day plan (day, date, 5 words, POS) and mark holidays; the words move to the next school day."
- Teacher: "I see a POS balance warning (only 5 adverbs) and can swap a word in the plan using the existing word picker."
- Student (intervention): "On Saturday the app says *No new words today. Come back on Monday!*"
- Student (comparison class): sees no daily words, only tests (F4) when open.
- Researcher: "I can print the exact 100-word list used in the study."

**Acceptance criteria**
1. `content/study/word-a-day-100.json`: 100 bank word ids in 20 days x 5, balanced (target ~35 nouns, 25 verbs, 25 adjectives, 15 adverbs, using bank adverbs), difficulty mostly 1-2, and it **includes every word used in F4's forms A and B** (test asserts it).
2. For an intervention class in a `running` study: study day n = the nth Mon-Fri date on or after `start_date` that is not a holiday; words = plan day n. Teacher per-date overrides still win.
3. Non-study days (weekend, holiday, before start, after day `schoolDays`) and comparison classes: `POST /student/sessions/today` returns 409 `{code:'conflict', message:'no_study_day'}` via the `studyGateRouter` (registered before `studentRouter`); after the study ends, the class returns to normal behaviour.
4. `GET /student/study-day` -> `{ inStudy, group, dayNo|null, totalDays, reason: 'study_day'|'weekend'|'holiday'|'not_started'|'finished'|'comparison' }`. Home card shows the rest-day message; `Play.tsx` on 409 returns to Home instead of showing "No internet".
5. Teacher plan page: 20 rows, holiday toggle per date, POS counts, print view.

**Data model (migration 5):** `study_holidays(study_id, date, PRIMARY KEY(study_id,date))`; `study_plan(study_id, day_no, position 1..5, word_id REFERENCES words(id), PRIMARY KEY(study_id, day_no, position))` (filled from the JSON when the study is created or on first plan read).

**API** (`routes/research/wordplan.ts`): `GET /studies/:studyId/plan`, `PUT /studies/:studyId/plan/:dayNo {wordIds[5]}`, `PUT /studies/:studyId/holidays {dates[]}`, `GET /student/study-day`; gate in `routes/research/studyGate.ts`. Pure helper `studyDayFor(startDate, date, holidays, schoolDays)` in `packages/core/src/research/wordplan.ts`.

**Files:** `server/src/services/dailySet.ts` (only feature to edit it), `student/research/cards/StudyDayCard.tsx`, `teacher/research/WordPlan.tsx`, 3 lines in `Play.tsx` catch block.

**Depends on:** F1 (study tables, `getStudyForClass`), F4 (form word list). **Tests:** core unit tests for `studyDayFor` (weekends, holidays, end), server test (Saturday 409, Monday = day n, comparison 409, override wins, non-study class unchanged), web test for the rest-day card.

**Privacy:** none new.

---

### F3. Part-of-speech activity in the daily flow (P0, M, migration 6)

**Serves:** skill B (identifying parts of speech); daily task "identify part of speech"; observation indicator 3.

**Exists:** POS chip on the learn card; `word_attempts.stage CHECK IN ('spell','meaning')`. **Missing:** an activity, storage, server-side correctness.

**User stories**
- Student: after the meaning check, "What kind of word is **brave**?" with 4 big buttons: Noun (naming word), Verb (doing word), Adjective (describing word), Adverb (how/when word), shown with the example sentence (target word highlighted). Wrong tap: a short hint ("It describes the soldier") and one more try; then the answer is revealed with a one-line explanation.
- Teacher: sees POS first-try accuracy per student (F7) and in research exports (F8).

**Acceptance criteria**
1. New stage `pos` between `check` and `write`; the caterpillar shows 4 dots per word; resume (saved `PlayState` v1 without `pos`) does not crash.
2. Only for words whose POS is noun/verb/adjective/adverb; other POS skip the stage.
3. Taps are queued in the outbox as `AttemptsReq.pos` (offline-safe, idempotent by `clientId`), max 2 attempts.
4. Server re-derives `is_correct` from `words.part_of_speech` (ignores the client), rejects `chosen` outside the 4 values, stores `stage='pos'`, `primary_error` `PS_WRONG_1` (right on 2nd) or `PS_WRONG_2` on the final row.
5. `WordScore` and XP are **unchanged** (no `scoring_version` bump): POS is measured, not scored, to keep existing analytics stable.
6. Real `msElapsed` is recorded (from stage start).

**Data model (migration 6):** `ALTER TABLE word_attempts DROP CONSTRAINT word_attempts_stage_check; ALTER TABLE word_attempts ADD CONSTRAINT word_attempts_stage_check CHECK (stage IN ('spell','meaning','pos'));`

**Contract (done by W0):** `PosAttemptInput` in `types.ts`, `AttemptsReq.pos?: PosAttemptInput[]` in `api.ts`, `Stage` gains `'pos'`.

**Files:** `packages/core/src/taxonomy.ts` (add `PosErrorCode` + labels), `server/src/routes/student.ts` (attempts handler), `apps/web/src/student/PosStage.tsx` (new), `Play.tsx` (stage switch, caterpillar), `play-logic.ts` (state), student CSS.

**Depends on:** W0. **Tests:** server (pos attempt stored, client `isCorrect` ignored, invalid option 400, word not in session 400, idempotent resend); web (`__tests__/pos.test.tsx`: correct tap advances to write, wrong tap shows hint, resume from old state); core taxonomy label test.

**Privacy:** none.

---

### F4. Assessment module: timed pre/post test (P0, L, migration 7)

**Serves:** the primary outcome (30 marks: A meanings 10, B parts of speech 10, C sentences 10); "how do you measure improvement"; part of "how do you know they are not copying" (supervised, timed, code-gated, shuffled).

**Exists:** rule sentence evaluator, on-screen keyboard, speech. **Missing:** everything else.

**Test design (fixed, versioned, server-only so answers never reach the student bundle)**
- `server/src/research/assessment-forms/form-a.json` and `form-b.json` (`formVersion`). Each: Section A 10 MCQ "What does *X* mean?" (4 options: the meaning, the 2 bank distractors, 1 other word's meaning); Section B 10 items: a sentence with the word underlined, "What part of speech is *X*?" (noun/verb/adjective/adverb), 3/3/2/2 mix; Section C 5 words "Write your own sentence using *X*" (2 marks each).
- Forms A and B use **different** words from the study list, matched on difficulty and POS (a test asserts the match). Default: A = pre, B = post (teacher can swap).
- Marking C (rules only, never Claude, for reproducibility; store evaluator version): 1 mark *word used correctly* (`gate==='ok'`, `rubric.use===10`, no `SN_WRONG_FORM`); 1 mark *meaningful sentence* (`gate==='ok'`, `grammar>=6`, `relevance>=8`, `length>0`, no `SN_NO_VERB`). `needs_review` when confidence < 0.6, exactly 1 mark, or a non-empty gated answer.

**User stories**
- Teacher: "I create the pre-test for 5A (form A, 25 min, app or paper mode), press Open, and write the 4-letter test code on the board. I see who has started/submitted live, then Close."
- Teacher: "I review flagged sentence answers and change marks; I can also type section marks from paper tests for children who wrote on paper."
- Student: "I tap *Test*, type the code, answer one question per screen with a timer bar, use the same on-screen keyboard, and see *Well done, you finished!* (no marks shown)."
- Researcher: "Each child's A/B/C/total for pre and post, with item-level data, auto vs final marks."

**Acceptance criteria**
1. Windows: one `pre` and one `post` per class; states draft -> open -> closed; access code required to start; a student can start only while open and only once (teacher can reset an attempt).
2. Server-enforced deadline = start + duration (+60 s grace); autosave per item (idempotent upsert); late writes 409; auto-submit at the deadline.
3. Item and option order shuffled per student (seeded, stable on reload); no feedback, XP or leaderboard during the test; daily Play is not affected.
4. Auto-marks for A and B are exact; C as above; final mark = override if set, else auto; paper mode = manual section totals (0-10 each).
5. Teacher results: per student A, B, C, total, needs-review count, status; item review screen with override; printable paper version of each form plus answer key and the marking scheme.
6. Works at 320 px width; large tap targets; speech button to read a question aloud (not the answer).

**Data model (migration 7):** `assessment_windows(id, class_id, kind 'pre'|'post', form_id 'A'|'B', form_version, mode 'app'|'paper', duration_min default 25, access_code, opened_at, closed_at, created_by, UNIQUE(class_id, kind))`; `assessment_attempts(id, window_id, student_id, started_at, deadline_at, submitted_at, order_seed, UNIQUE(window_id, student_id))`; `assessment_responses(attempt_id, item_id, section, answer, auto_marks, auto_detail_json, override_marks, overridden_by, overridden_at, needs_review, ms_elapsed, keystrokes, deletions, updated_at, PRIMARY KEY(attempt_id, item_id))`; `assessment_manual_scores(window_id, student_id, section_a, section_b, section_c, entered_by, entered_at, PRIMARY KEY(window_id, student_id))`.

**API** (`routes/research/assessments.ts`): teacher `GET/POST /classes/:classId/assessments`, `PATCH /classes/:classId/assessments/:windowId {action:'open'|'close'|'reset_attempt', studentId?}`, `GET .../:windowId/results`, `GET .../:windowId/students/:studentId`, `PATCH .../:windowId/students/:studentId/items/:itemId {overrideMarks|null}`, `PUT .../:windowId/students/:studentId/manual {a,b,c}`, `GET /assessment-forms/:formId/print`; student `GET /student/assessments/current`, `POST /student/assessments/:windowId/start {accessCode}`, `PUT /student/assessments/:windowId/responses {items[]}`, `POST /student/assessments/:windowId/submit`. Service `assessmentScores(db, classId)` -> `{ studentId, kind, a, b, c, total, complete }[]` for F8.

**UI:** `student/research/TestApp.tsx` (lazy `/test/*`), `student/research/cards/TestCard.tsx`, `teacher/research/Assessments.tsx` (`/teacher/classes/:classId/tests/*`).

**Depends on:** W0 (F1 not required; F8 joins study codes later). **Tests:** server (open/close, wrong code 403, double start returns same attempt, deadline 409, answers never in student payloads, A/B auto-marks, C marking cases incl. copied/irrelevant/missing word, override and manual precedence, tenancy); core/unit for the marking function; form-balance test; web (timer, autosave call, keyboard input in C, submit screen, teacher override form).

**Privacy:** responses tied to student id internally; exports use study codes (F8). Test sentences are not exported as text by default.

---

### F5. Sentence authenticity (anti-copying) signals (P1, M, migration 8)

**Serves:** the judge question "how do you know students are not copying"; validity of skill C.

**Exists:** paste impossible (custom keyboard); `SN_COPIED` vs the example sentence; `ms_elapsed`. **Missing:** peer-copy detection, template detection, typing signals, a teacher review screen, an "own-work rate".

**Signals (pure functions in `packages/core/src/research/authenticity.ts`)**
1. `example_copy`: Jaccard >= 0.6 with the example (existing) and `example_near` 0.4-0.6.
2. `peer_match`: same word, same class, Jaccard >= 0.8 with another student's earlier sentence (the earliest author is not flagged).
3. `template`: the student's sentences with the target word masked repeat the same frame (Jaccard >= 0.8) for >= 3 different words ("I like X very much").
4. `typing`: keystrokes < characters (text did not come from the keyboard), or > 4 characters per second over the whole sentence, or < 4 s for >= 25 characters.
5. `starter`: "Help me start" used (informational).
Flags are "check" hints, never penalties; the child is never told.

**User stories**
- Teacher: "A *Sentence check* page lists flagged sentences with the reason; I mark each *Own work* or *Not own work*."
- Researcher: "The report states: X% of N sentences had no flag; peer matches Y; teacher-confirmed copying Z."
- Student: nothing changes.

**Acceptance criteria:** client counts keystrokes and deletions in `WriteStage` and sends them (`SentenceSubmissionInput.keystrokes/deletions`, added by W0); server stores them plus a normalised text hash; `GET /classes/:classId/authenticity?from&to` returns per-student counts and flagged items (daily sentences **and** F4 section C answers, peer matching inside the same test window); `PATCH /classes/:classId/authenticity/:kind/:id {status:'ok'|'not_own'|null}`; service `authenticitySummary(db, classIds, from, to)` for F8.

**Data model (migration 8):** `ALTER TABLE sentence_submissions ADD COLUMN keystrokes integer, ADD COLUMN deletions integer, ADD COLUMN norm_hash text, ADD COLUMN review_status text, ADD COLUMN reviewed_by integer REFERENCES teachers(id) ON DELETE SET NULL; CREATE INDEX sentence_submissions_word_hash_idx ON sentence_submissions(word_id, norm_hash); ALTER TABLE assessment_responses ADD COLUMN review_status text;`

**Files:** `server/src/routes/student.ts` (sentence handler: store 3 fields), `Play.tsx` `WriteStage` (counting), `routes/research/authenticity.ts`, `services/research/authenticity.ts`, `teacher/research/Authenticity.tsx`.

**Depends on:** F4 (responses table), W0 contract. **Tests:** core unit tests per signal (fixtures), server (peer match flags the later student only, template after 3 words, keystrokes stored, review PATCH, tenancy), web (keystroke counter increments; teacher review buttons).

**Privacy:** the page shows the other student's first name only inside the teacher UI; F8 exports counts only.

---

### F6. Recall challenge and My Vocabulary Bank (P1, M, migration 9)

**Serves:** daily task "revise earlier words"; observation indicator 6; retention (supports post-test gains).

**Exists:** word_scores (what each child finished), sentences with marks. **Missing:** revision activity and a personal word list.

**User stories**
- Student: "Before today's words, *Yesterday's words challenge*: 5 quick taps (meaning or word type) on the words from my last study day. Then older words I got wrong come back."
- Student: "*My Word Bank* shows every word I learned with its meaning, type, my best sentence and stars; I can filter by noun/verb/adjective/adverb and tap to hear it."
- Teacher: recall accuracy per student in F7.

**Acceptance criteria:** `GET /student/recall/today` -> up to 5 items from the most recent completed session before today (fill with earlier words that had wrong attempts), each `{itemId, wordId, kind:'meaning'|'pos', prompt, options}` with no answer; `POST /student/recall/answers` (idempotent `clientId`) re-derives correctness server-side and returns `{results[]}`; one recall set per student per date (repeat play allowed but only the first counts); `GET /student/bank` -> learned words with meaning, POS, example, best counted sentence, stars, recall accuracy. Pages lazy-loaded, offline: bank cached in localStorage.

**Data model (migration 9):** `recall_attempts(id, client_id UNIQUE, student_id, date, word_id, kind, chosen, is_correct, counted, ms_elapsed, client_ts, server_ts)`, index `(student_id, date)`.

**Files:** `routes/research/vocab.ts`, `services/research/recall.ts`, `student/research/Recall.tsx`, `student/research/Bank.tsx`, `student/research/cards/RevisionCard.tsx`, `shared/research/vocab-api.ts`.

**Depends on:** W0; uses F3's POS options. **Tests:** server (items come from the previous session, no answers leaked, correctness derived, idempotent, only own words in bank); web (recall flow, bank filter).

**Privacy:** a child sees only their own sentences.

---

### F7. Vocabulary Progress Tracker and participation record (P1, S, no migration)

**Serves:** daily vocabulary assignment record; student participation/completion record; observation support.

**Exists:** today dashboard, analytics, CSV. **Missing:** a whole-study per-student view of words completed and accuracy by skill, and a printable day x student grid.

**User stories:** Teacher: "One table: each child's days active, days completed, words completed (of 100), meaning first-try %, POS first-try %, average sentence marks, recall %, last active; tap a child for details; a printable assignment record (rows = students, columns = study days, cells = words done / 5)." Toggle "Show study codes instead of names" for printing at the exhibition.

**Acceptance criteria:** `GET /classes/:classId/progress?from&to` (defaults to the study window when the class is in a study, else last 28 days) returns `ProgressRes {days[], students[{studentId, rollNo, firstName, studyCode|null, daysActive, daysCompleted, wordsCompleted, meaningFirstTryPct, posFirstTryPct, sentenceAvgPct, recallPct, lastActive, grid: Record<date, 0..5|null>}]}`; non-study days excluded; page sortable; print CSS.

**Files:** `routes/research/progress.ts`, `services/research/progress.ts`, `teacher/research/Progress.tsx`.

**Depends on:** F1, F2, F3, F6. **Tests:** server (counts from seeded sessions/attempts; pos and recall percentages; codes when in study), web (renders, code toggle hides names).

**Privacy:** names stay in the teacher UI; the code toggle for printing.

---

### F8. Study results dashboard and one-click research export (P0, L, no migration)

**Serves:** analysis (per-student pre/post, mean, SD, mean improvement, % improvement, paired t-test t/df/p, per-skill breakdown, charts), participation and completion rates, comparison group, the exhibition report.

**Exists:** nothing statistical. **Missing:** stats library, results service, dashboard, export, printable report.

**Statistics (`packages/core/src/research/stats.ts`, pure, no dependencies):** `mean`, `sd` (n-1), `pairedTTest(pre, post)` -> `{n, meanDiff, sdDiff, t, df, p (two-tailed), ci95, cohenDz}`, `welchTTest(a, b)` (comparison: gains vs gains), `tCdf` via the regularised incomplete beta function (continued fraction), `tInv` by bisection for the CI, `pctImprovement = (meanPost - meanPre) / meanPre * 100` (null when meanPre = 0), per-student `gain` and `pctGain`. Unit tests against reference values (for example t = 2.5, df = 9 -> p = 0.0339; t = 5, df = 29 -> p = 2.5e-5).

**Analysable sample:** consent `given`, not excluded, both pre and post complete. Report N enrolled, N consented, N analysed, N missing pre/post.

**User stories**
- Researcher/teacher: "A *Results* page: tiles (N, mean pre, mean post, mean improvement, % improvement, p-value), a pre vs post bar chart per skill, a per-student slope chart, a gains histogram, a table per skill (mean, SD pre/post, t, df, p, d) with plain-English lines ('p < 0.05: the improvement is very unlikely to be chance')."
- Researcher: "**Download research pack**: one CSV with sections (scores per student by code, summary statistics, participation, feedback summary, observation summary, authenticity counts) plus separate CSVs per table; and a printable A4 report (Print -> Save as PDF)."
- Teacher with a comparison class: "Intervention vs comparison gains with Welch's t-test."
- School admin: read-only access to the same page.

**Acceptance criteria:** `GET /studies/:studyId/results` -> `StudyResultsRes`; `GET /studies/:studyId/export.csv?type=pack|scores|summary|participation|feedback|observations|authenticity` (UTF-8 BOM, filenames without names); **no first names, roll numbers or sentence texts** in any export (test greps the CSV for every seeded first name); participation = per study day share of analysable students who completed the set; completion rate per student = days completed / study days elapsed; audit `study.export`; charts are inline SVG (no new chart library), readable in print.

**Files:** `packages/core/src/research/stats.ts`, `services/research/results.ts`, `routes/research/results.ts`, `teacher/research/Results.tsx` (`/teacher/study/:studyId/results/*` incl. `report`).

**Depends on:** F1, F4 (required); F2, F5, F7-like counts, F9 (optional sections; skip a section when its tables are empty). **Tests:** core stats (reference values, n < 2 handled, zero variance), server (seed 10 students with known pre/post -> exact means/t/p; exclusion of non-consented; comparison Welch; CSV has no names), web (tiles render, p formatting, print route).

**Privacy:** the central anonymisation point; exports always via `study_code`.

---

### F9. Observation checklist and feedback questionnaire (P1, M, migration 10)

**Serves:** classroom observation checklist (6 yes/no indicators) and end-of-study feedback questionnaire (5 items, Yes / To some extent / No).

**Exists:** nothing. **Missing:** both instruments, in-app and paper entry, summaries.

**Instrument text (constants in `packages/core/src/research/instruments.ts`)**
- Observation (per student per week 1-4): accesses the app regularly; understands word meanings; identifies parts of speech correctly; constructs own sentences; participates actively; revises earlier words.
- Feedback (child-friendly English): 1 "I enjoyed learning new words with the app." 2 "The app helped me understand word meanings." 3 "I can tell if a word is a noun, verb, adjective or adverb." 4 "I can write my own sentences with new words." 5 "I want to keep learning words this way."

**User stories:** Teacher: "Each Friday I open *Observations*, pick week n and tap Yes/No for 6 indicators per child (fast grid, saves as I tap)." Teacher: "At the end I open the questionnaire; children answer in the app; I can type paper answers too." Student: "5 questions, read aloud, with 3 big buttons: Yes / To some extent / No." Researcher: "Counts and % per indicator per week, per feedback item."

**Acceptance criteria:** upsert endpoints, unique per (study, student, week) and (study, student, item); questionnaire only while `feedback_open_at` is set and not closed; a student answers once (can change until closed); summaries computed; only study participants appear; Home card shows "Tell us what you think" only when open.

**Data model (migration 10):** `observation_records(study_id, student_id, week_no 1..8, accesses, meanings, pos, sentences, participates, revises (0/1 each, NULL = not observed), observed_on, observer_id, PRIMARY KEY(study_id, student_id, week_no))`; `feedback_responses(study_id, student_id, item_no 1..5, answer CHECK IN ('yes','some','no'), source 'app'|'paper', updated_at, PRIMARY KEY(study_id, student_id, item_no))`; `ALTER TABLE studies ADD COLUMN feedback_open_at text, ADD COLUMN feedback_closed_at text;`

**API** (`routes/research/instruments.ts`): `GET/PUT /studies/:studyId/observations?week=`, `GET /studies/:studyId/feedback`, `PATCH /studies/:studyId/feedback-window {open}`, `PUT /studies/:studyId/feedback/:studentId {answers}`, student `GET /student/feedback`, `POST /student/feedback {answers}`; service `instrumentSummary(db, studyId)` for F8.

**Files:** `teacher/research/Instruments.tsx` (`/teacher/study/:studyId/instruments/*`), `student/research/Feedback.tsx`, `student/research/cards/FeedbackCard.tsx`.

**Depends on:** F1. **Tests:** server (upsert, closed window 409, non-participant 404, summary counts), web (grid toggles call PUT; student flow posts 5 answers).

**Privacy:** no free-text fields at all (avoids accidental personal data).

---

## 6. Agent briefs

Every brief assumes the common facts below, repeated inside each brief so it can be pasted alone.

---

### Brief W0: research scaffold

Repo: `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows). npm workspaces: `packages/core` (pure TS types/rules), `server` (Express 5 + Postgres), `apps/web` (React 19 + Vite PWA). Read `docs/RESEARCH_FEATURES.md` sections 3-4 first.

Goal: create empty slots so 9 later agents never edit the same lines. No behaviour change.

Do:
1. `server/src/db/migrations/m0004-study.ts`, `m0005-wordplan.ts`, `m0006-pos.ts`, `m0007-assessment.ts`, `m0008-authenticity.ts`, `m0009-recall.ts`, `m0010-instruments.ts`, each `import type { Migration } from '../migrations.ts'; export const M0004: Migration[] = [];` (matching number). In `migrations.ts` import them and append `...M0004, ..., ...M0010` after version 3.
2. `server/test/db.test.ts`: replace `toEqual([1, 2, 3])` with `toEqual(MIGRATIONS.map((m) => m.version))`.
3. `server/src/routes/research/{study,wordplan,assessments,authenticity,vocab,progress,results,instruments,studyGate}.ts`, each `export const xRouter = Router();`; `routes/research/index.ts` exports `researchRouter` composed of all except the gate. In `server/src/app.ts` add `studyGateRouter` immediately before `studentRouter` and `researchRouter` after `adminRouter`.
4. `packages/core/src/research/{study,wordplan,pos,assessment,authenticity,vocab,progress,results,instruments,stats}.ts` with `export {};`; add `export * from './research/<name>.ts';` lines to `packages/core/src/index.ts`.
5. Contract edits: in `types.ts` add `'pos'` to `Stage`, add `PosAttemptInput { clientId; wordId; attemptNo: 1|2; chosen: 'noun'|'verb'|'adjective'|'adverb'; msElapsed; clientTs }`, add optional `keystrokes?: number; deletions?: number` to `SentenceSubmissionInput`. In `api.ts` add `pos?: PosAttemptInput[]` to `AttemptsReq`.
6. Web teacher stubs `apps/web/src/teacher/research/{StudyPages,WordPlan,Assessments,Authenticity,Progress,Results,Instruments}.tsx` (default export, "Coming soon" inside the existing `Page` layout). Register in `TeacherApp.tsx` inside `<Guard>`: `study/*`, `study/:studyId/words`, `study/:studyId/results/*`, `study/:studyId/instruments/*`, `classes/:classId/tests/*`, `classes/:classId/authenticity`, `classes/:classId/progress`. In `teacher/ui.tsx` nav add Progress, Tests, Checks (class) and Study (global).
7. Student: lazy stubs `student/research/{TestApp,Recall,Bank,Feedback}.tsx` with routes `test/*`, `recall`, `bank`, `feedback` in `StudentApp.tsx`; `student/research/HomeCards.tsx` rendering `cards/{StudyDayCard,TestCard,RevisionCard,FeedbackCard}.tsx` (each `return null`); render `<HomeCards home={home} />` in `student/Home.tsx` above the Start button.
8. Empty folder marker `apps/web/src/shared/research/` (README not needed; add `index.ts` with `export {};`).

Verify: `npm run typecheck`; `$env:TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/postgres'; $env:TEST_DB_NAME='shabd_test_w0'; npm test -w @shabd/server`; `cd apps/web; npx vitest run`; `npm run build; npm run check:bundle`.

Done when all pass, and the app behaves exactly as before.

---

### Brief F1: study setup, study IDs, consent, comparison group

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, PowerShell; Postgres 127.0.0.1:5432 postgres/postgres). Workspaces: `packages/core`, `server` (Express 5 + pg, tests with supertest, helpers in `server/test/helpers.ts`: `setup()`, `makeSchool()`), `apps/web` (React 19). Scaffold W0 exists: you fill only your stub files. Spec: `docs/RESEARCH_FEATURES.md` F1.

Create/modify only:
- `server/src/db/migrations/m0004-study.ts`: `[{version: 4, name: 'research studies', sql}]` with tables `studies`, `study_classes`, `study_participants` (SQL in the spec; follow conventions in `migrations.ts`: text ISO timestamps via `iso_now()`, 0/1 integers).
- `packages/core/src/research/study.ts`: types `Study`, `StudyGroup`, `ConsentStatus`, `StudyParticipant`, request/response types.
- `server/src/services/research/study.ts`: CRUD, `assignCodes` (S01.. intervention / C01.. comparison by roll_no, append-only), `getStudyForClass(db, classId)`, `deleteResearchData` (delete rows in research tables that exist; check `to_regclass` so it works before F4/F9 tables exist).
- `server/src/routes/research/study.ts`: endpoints listed in the spec. Per-route `requireTeacher`; use `staffAuth`, `assertCanAccessClass` (`server/src/tenancy.ts`); a study is visible if the staff member can access one of its classes or is the school admin of its school; otherwise 404. Audit via `services/audit.ts` with ids only.
- `apps/web/src/shared/research/study-api.ts` (use `request` from `shared/api.ts`, scope `'staff'`).
- `apps/web/src/teacher/research/StudyPages.tsx` (+ nested routes): list, create, study home with links, participants table with consent select and exclude toggle, printable code sheet (`window.print`, `no-print` class for controls).

Acceptance: spec F1 criteria 1-8.

Tests:
- `server/test/research-study.test.ts`: create study, attach classes, codes S01-S03 and C01, append on new student, consent PATCH, other school 404, teacher without class 404, withdrawal, audit meta without names.
- `apps/web/src/teacher/research/__tests__/study.test.tsx` (mock `fetch`).
Run: `$env:TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/postgres'; $env:TEST_DB_NAME='shabd_test_f1'; npm test -w @shabd/server`; `cd apps/web; npx vitest run`; `npm run typecheck`.

Constraints: do not edit other features' files, `types.ts`, `api.ts`, `app.ts`, `migrations.ts`, `TeacherApp.tsx`. No new personal data (first name + roll only; codes are the research identifiers). English UI, mobile-first (320 px). Never `router.use()` without a path.

Done: all tests and typecheck pass; a teacher can create a study and print codes on a phone-width screen.

---

### Brief F2: 100-word study plan and school-day calendar

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core`, `server`, `apps/web`. W0 scaffold, F1 (studies, `getStudyForClass`) and F4 (forms in `server/src/research/assessment-forms/`) are merged. Spec: `docs/RESEARCH_FEATURES.md` F2.

Problem: `dayIndexFor` (`packages/core/src/dates.ts`) counts calendar days, so weekends consume words. Study needs 20 school days x 5 words.

Create/modify only:
- `content/study/word-a-day-100.json`: 20 days x 5 bank word ids (`dNNN-S`), balanced POS (about 35 noun, 25 verb, 25 adjective, 15 adverb), difficulty 1-2 mostly, containing every word in F4 forms A and B. Write a small Node script in your scratch area to pick candidates; commit only the JSON.
- `server/src/db/migrations/m0005-wordplan.ts`: `study_holidays`, `study_plan` (spec).
- `packages/core/src/research/wordplan.ts`: pure `studyDayFor(startDate, date, holidays, schoolDays)` -> `{dayNo|null, reason}`; types.
- `server/src/services/dailySet.ts`: for an intervention class in a running study, resolve words from `study_plan` day n (seed plan from JSON on first use); teacher overrides still win; non-study classes unchanged.
- `server/src/routes/research/wordplan.ts`: `GET /studies/:studyId/plan`, `PUT /studies/:studyId/plan/:dayNo`, `PUT /studies/:studyId/holidays`, `GET /student/study-day`.
- `server/src/routes/research/studyGate.ts`: `POST /student/sessions/today` -> 409 `no_study_day` on non-study days or for comparison classes, else `next()`.
- `apps/web/src/student/research/cards/StudyDayCard.tsx`, `apps/web/src/shared/research/wordplan-api.ts`, `apps/web/src/teacher/research/WordPlan.tsx` (20 rows, holiday toggles, POS counts, print).
- `apps/web/src/student/Play.tsx`: only the `startToday` catch: on `ApiRequestError` status 409 navigate to `/` (do not fall back to the cached session).

Tests: core `packages/core/test/wordplan.test.ts` (weekend, holiday shift, before start, after end); `server/test/research-wordplan.test.ts` (use `FAKE_TODAY` = Friday 2026-11-20; Saturday 409; Monday next day; comparison 409; override wins; JSON validity + form words included); web test for the card. Run with `TEST_DB_NAME='shabd_test_f2'` (see W0 commands), `cd apps/web; npx vitest run`, `npm run typecheck`, `npm run validate:words`.

Constraints: do not edit other features' files or frozen contracts; English, child-friendly, mobile-first; no personal data.

Done: tests pass; a student opening the app on a Saturday sees the rest-day card.

---

### Brief F3: part-of-speech activity in the daily flow

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core`, `server`, `apps/web`. W0 already added `'pos'` to `Stage`, `PosAttemptInput`, and `AttemptsReq.pos`. Spec: `docs/RESEARCH_FEATURES.md` F3.

Daily flow today (`apps/web/src/student/Play.tsx`, `play-logic.ts`): spell -> learn -> check (meaning) -> write. Add a `pos` stage after `check`.

Create/modify only:
- `server/src/db/migrations/m0006-pos.ts`: replace constraint `word_attempts_stage_check` to allow `'pos'`.
- `packages/core/src/taxonomy.ts`: add `PosErrorCode` (`PS_WRONG_1`, `PS_WRONG_2`) and labels in `ERROR_LABELS` ('Word type: 2nd try', 'Word type: not yet').
- `server/src/routes/student.ts`: in the attempts handler accept `body.pos` like `meaning`: word must be in the session snapshot, `attemptNo` 1-2, `chosen` in the 4 values, derive `is_correct` from `words.part_of_speech` (ignore client), set `primary_error` on the final row, idempotent by `client_id`.
- `apps/web/src/student/PosStage.tsx` (new): question "What kind of word is *X*?", example sentence with the word highlighted (`highlightParts`), 4 big buttons with helper text (naming / doing / describing / how-when word), one hint after a wrong tap, reveal after 2 wrong, "Next" goes to `write`. Queue taps with `enqueue({kind:'attempts', ..., body:{pos:[...]}})` exactly like `CheckStage`.
- `Play.tsx`: render `PosStage`; `CheckStage` "Next" goes to `pos` (or `write` when the POS is outside the 4); caterpillar 4 dots.
- `play-logic.ts`: `pos: { wrongTaps: string[]; done: boolean; t0: number }` in `PlayState`, defaulted when loading an older saved state.
- Do not change `WordScore`, XP or `scoring_version`.

Tests: extend nothing shared; add `server/test/research-pos.test.ts` (stored row, client opinion ignored, bad option 400, foreign word 400, resend idempotent) and `apps/web/src/student/__tests__/pos.test.tsx` (correct, wrong then hint, resume old state). Run with `$env:TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/postgres'; $env:TEST_DB_NAME='shabd_test_f3'; npm test -w @shabd/server`, `cd apps/web; npx vitest run`, `npm run typecheck`, `npm run build; npm run check:bundle`, optionally `npm run e2e`.

Constraints: no other features' files; English, child-friendly, big tap targets, 320 px; no personal data.

Done: tests pass; a full day's play works offline and online with the new stage.

---

### Brief F4: assessment module (timed pre/post test)

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core` (has `evaluateSentenceRules`), `server`, `apps/web` (has `shared/OnScreenKeyboard.tsx`, `shared/speech.ts`). W0 stubs exist. Spec: `docs/RESEARCH_FEATURES.md` F4 (read it fully).

Create/modify only:
- `server/src/research/assessment-forms/form-a.json`, `form-b.json`: section A 10 meaning MCQ (4 options), B 10 POS-in-sentence items (3 noun, 3 verb, 2 adjective, 2 adverb), C 5 sentence words; words from bank days 1-20 plus bank adverbs; A and B use different words matched on POS and difficulty. Server-only (never import from web).
- `server/src/db/migrations/m0007-assessment.ts`: 4 tables from the spec.
- `packages/core/src/research/assessment.ts`: public types (items without answers) and pure `markSentenceItem(text, wordCtx)` -> `{marks 0-2, useMark, meaningMark, needsReview, detail}` using `evaluateSentenceRules` (never Claude).
- `server/src/services/research/assessment.ts` (+ `assessmentScores(db, classId)`), `server/src/routes/research/assessments.ts` (all endpoints in the spec; teacher routes `requireTeacher` + `assertCanAccessClass`; student routes `requireStudent`, own class only).
- `apps/web/src/shared/research/assessment-api.ts`, `apps/web/src/student/research/TestApp.tsx` (code entry, section intros, one item per screen, timer bar, keyboard for C, autosave with retry and localStorage backup, review and submit, "Well done!" with no marks), `student/research/cards/TestCard.tsx` (shows only when a window is open), `apps/web/src/teacher/research/Assessments.tsx` (create/open/close, live status, results table, item review with override, manual paper entry, printable form + answer key + marking scheme).

Rules: deadline enforced server-side (+60 s grace, auto-submit); shuffle items/options per student with a stored seed; answers never sent to students; final = override ?? auto; paper mode uses manual totals.

Tests: `server/test/research-assessment.test.ts` (lifecycle, wrong code 403, one attempt, deadline 409 using `FAKE_TODAY` and a clock helper in `server/src/clock.ts` if present, payload has no answers, marking A/B/C, override/manual precedence, tenancy), `packages/core/test/assessment.test.ts`, form-balance test, web tests for TestApp and teacher override. Run with `TEST_DB_NAME='shabd_test_f4'` (see W0), `cd apps/web; npx vitest run`, `npm run typecheck`, `npm run check:bundle` after build.

Constraints: no other features' files; English, child-friendly, mobile-first; no personal data beyond first name + roll.

Done: a class can sit the pre-test on phones and the teacher sees A/B/C/total per child.

---

### Brief F5: sentence authenticity signals

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core` (has `tokenize`, `jaccard` in `sentence.ts`), `server`, `apps/web`. W0 added `keystrokes?`/`deletions?` to `SentenceSubmissionInput`; F4 (assessment_responses) is merged. Spec: `docs/RESEARCH_FEATURES.md` F5.

Create/modify only:
- `server/src/db/migrations/m0008-authenticity.ts` (columns + index in the spec).
- `packages/core/src/research/authenticity.ts`: pure `normaliseSentence`, `maskTarget`, `exampleSimilarity`, `findPeerMatches`, `findTemplates`, `typingFlags({chars, keystrokes, msElapsed})`, `flagsFor(...)` returning codes `example_copy|example_near|peer_match|template|typing|starter`. Thresholds as named constants.
- `server/src/routes/student.ts` sentence handler: store `keystrokes`, `deletions`, `norm_hash` (sha1 of normalised text). Nothing else in that file.
- `apps/web/src/student/Play.tsx` `WriteStage` only: count keystrokes (each change that grows text) and deletions (each shrink) in play state, send them with the submission, reset per submission.
- `server/src/services/research/authenticity.ts` (`authenticitySummary(db, classIds, from, to)`), `server/src/routes/research/authenticity.ts` (`GET /classes/:classId/authenticity`, `PATCH /classes/:classId/authenticity/:kind/:id`, kind `daily|test`).
- `apps/web/src/shared/research/authenticity-api.ts`, `apps/web/src/teacher/research/Authenticity.tsx`: per-student counts, flagged list with reason chips, Own work / Not own work buttons. Wording: "check", never "cheating".

Tests: `packages/core/test/authenticity.test.ts` (each signal, thresholds, earliest author not flagged), `server/test/research-authenticity.test.ts` (keystrokes stored; peer match across two students; template after 3 words; test-window matching; review PATCH; tenancy 404), web test for the keystroke counter and review buttons. Run with `TEST_DB_NAME='shabd_test_f5'` (see W0 commands), `cd apps/web; npx vitest run`, `npm run typecheck`.

Constraints: the child never sees flags; no score changes; no other features' files; English, mobile-first; exports elsewhere use counts only.

Done: teacher can show judges a list of flagged sentences and an own-work rate.

---

### Brief F6: recall challenge and My Vocabulary Bank

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core`, `server` (tables `sessions`, `word_scores`, `word_attempts`, `sentence_submissions`, `words`), `apps/web`. W0 stubs exist (`student/research/Recall.tsx`, `Bank.tsx`, `cards/RevisionCard.tsx`, routes `/recall`, `/bank`). Spec: `docs/RESEARCH_FEATURES.md` F6.

Create/modify only:
- `server/src/db/migrations/m0009-recall.ts`: `recall_attempts` (spec).
- `packages/core/src/research/vocab.ts`: types `RecallItem`, `RecallTodayRes`, `RecallAnswersReq/Res`, `BankWord`, `BankRes`.
- `server/src/services/research/recall.ts`: choose up to 5 words from the student's latest session before today (then earlier words with wrong attempts); item kind alternates meaning (3 options from the word's meaning + distractors) and POS (4 options); deterministic per student+date.
- `server/src/routes/research/vocab.ts`: `GET /student/recall/today`, `POST /student/recall/answers` (server derives correctness; `client_id` idempotent; only the first set per date `counted=1`), `GET /student/bank` (words with a `word_scores` row: meaning, POS, example, best counted sentence, stars, recall %). Per-route `requireStudent`.
- `apps/web/src/shared/research/vocab-api.ts`, `student/research/Recall.tsx` (5 quick taps, praise, then "Start today's words"), `student/research/Bank.tsx` (search, POS filter chips, tap to hear via `shared/speech.ts`, localStorage cache), `cards/RevisionCard.tsx` ("Yesterday's words challenge" + "My Word Bank" buttons).

Tests: `server/test/research-recall.test.ts` (items from previous session, no answers in payload, correctness derived, idempotent, other student's words never returned), web tests for Recall and Bank filter. Run with `$env:TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/postgres'; $env:TEST_DB_NAME='shabd_test_f6'; npm test -w @shabd/server`, `cd apps/web; npx vitest run`, `npm run typecheck`, `npm run build; npm run check:bundle` (pages must be lazy).

Constraints: no XP changes; no other features' files; English, big buttons, 320 px; a child sees only their own data.

Done: a child can revise yesterday's words and browse their bank on a phone.

---

### Brief F7: Vocabulary Progress Tracker

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core`, `server`, `apps/web`. Merged: W0, F1 (`getStudyForClass`, `study_participants.study_code`), F2 (`studyDayFor`, holidays), F3 (`word_attempts.stage='pos'`), F6 (`recall_attempts`). Existing analytics patterns: `server/src/services/analytics.ts`. Spec: `docs/RESEARCH_FEATURES.md` F7. No migration.

Create/modify only:
- `packages/core/src/research/progress.ts`: `ProgressRes`, `ProgressStudentRow`.
- `server/src/services/research/progress.ts`: `classProgress(db, classId, from, to)`; window defaults to the study's school days (only study days) when the class is in a study, else last 28 days. Per student: daysActive (session started), daysCompleted (`completed_at`), wordsCompleted (`word_scores` rows), meaningFirstTryPct, posFirstTryPct (attempt 1 correct), sentenceAvgPct (best counted `raw_total`/40), recallPct (counted recall rows), lastActive, grid date -> words done (0-5) or null.
- `server/src/routes/research/progress.ts`: `GET /classes/:classId/progress?from&to` with `requireTeacher` + `assertCanAccessClass`.
- `apps/web/src/shared/research/progress-api.ts`, `apps/web/src/teacher/research/Progress.tsx`: sortable table with colour chips, tap a row -> `/teacher/students/:id`, printable "Daily vocabulary assignment record" grid, toggle "Show study codes" that hides names.

Tests: `server/test/research-progress.test.ts` (seed sessions/attempts via the real student API in `helpers.ts`; check every metric; study-window defaults; tenancy 404), `apps/web/src/teacher/research/__tests__/progress.test.tsx` (code toggle hides first names). Run with `TEST_DB_NAME='shabd_test_f7'` (see W0 commands), `cd apps/web; npx vitest run`, `npm run typecheck`.

Constraints: no other features' files; no new personal data; mobile-friendly table (horizontal scroll inside the card only).

Done: teacher sees words completed and accuracy for every child at a glance and can print the record.

---

### Brief F8: study results dashboard and research export

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core`, `server`, `apps/web`. Merged: F1 (studies, participants, codes, consent), F2, F3, F4 (`assessmentScores`), F5 (`authenticitySummary`), F6, F7, F9 (`instrumentSummary`). Spec: `docs/RESEARCH_FEATURES.md` F8. No migration.

Create/modify only:
- `packages/core/src/research/stats.ts`: `mean`, `sd` (n-1), `pairedTTest`, `welchTTest`, `tCdf` (regularised incomplete beta, continued fraction), `tInv` (bisection), `pctImprovement`, `cohenDz`. No dependencies.
- `packages/core/src/research/results.ts`: `StudyResultsRes` (participants by code, per section A/B/C/total pre, post, gain, pctGain; summary per group and section; tTests; comparison; participation; optional authenticity, observations, feedback).
- `server/src/services/research/results.ts`, `server/src/routes/research/results.ts`: `GET /studies/:studyId/results`, `GET /studies/:studyId/export.csv?type=pack|scores|summary|participation|feedback|observations|authenticity` (UTF-8 BOM like `exportCsv` in `services/analytics.ts`; filename `study-<id>-<type>-<date>.csv`; audit `study.export`). Analysable = consent `given`, not excluded, both tests complete. Report N enrolled/consented/analysed/missing.
- `apps/web/src/shared/research/results-api.ts`, `apps/web/src/teacher/research/Results.tsx` (`results` and `results/report`): KPI tiles, inline-SVG charts (pre vs post bars per skill, per-student slope chart, gains histogram), stats table with plain-English interpretation, "Download research pack" button, A4 print report.

Tests: `packages/core/test/stats.test.ts` (t=2.5 df=9 -> p~0.0339; t=5 df=29 -> p~2.5e-5; paired example computed by hand; n<2 and zero variance return null), `server/test/research-results.test.ts` (10 seeded students with known scores via manual paper entry -> exact mean/SD/t/p; non-consented excluded; Welch comparison; **CSV contains none of the seeded first names or roll numbers**), web test for tiles and p formatting (`p < 0.001`). Run with `TEST_DB_NAME='shabd_test_f8'` (see W0 commands), `cd apps/web; npx vitest run`, `npm run typecheck`.

Constraints: no other features' files; exports carry study codes only, never names, rolls or sentence texts; no new chart library.

Done: one click produces the anonymised research pack and a printable report with the paired t-test.

---

### Brief F9: observation checklist and feedback questionnaire

Repo `C:\Users\Mahalakshmi\OneDrive\Desktop\Mahavishnu\avishkar-vocab-app` (Windows, Postgres 127.0.0.1:5432 postgres/postgres). Workspaces `packages/core`, `server`, `apps/web`. Merged: W0, F1 (`studies`, `study_participants`, `getStudyForClass`). Spec: `docs/RESEARCH_FEATURES.md` F9.

Create/modify only:
- `server/src/db/migrations/m0010-instruments.ts`: `observation_records`, `feedback_responses`, `studies.feedback_open_at/feedback_closed_at` (spec).
- `packages/core/src/research/instruments.ts`: the 6 observation indicators and 5 feedback items (exact text in the spec), answer type `'yes'|'some'|'no'` labelled Yes / To some extent / No, request/response types, `InstrumentSummary`.
- `server/src/services/research/instruments.ts` (`instrumentSummary(db, studyId)`: per week x indicator yes/no/not-observed counts; per item answer counts and %).
- `server/src/routes/research/instruments.ts`: `GET/PUT /studies/:studyId/observations?week=`, `GET /studies/:studyId/feedback`, `PATCH /studies/:studyId/feedback-window`, `PUT /studies/:studyId/feedback/:studentId` (paper), `GET /student/feedback`, `POST /student/feedback`. Staff routes check study access like F1; student routes only for participants of an open window (409 when closed, 404 when not a participant).
- `apps/web/src/shared/research/instruments-api.ts`, `apps/web/src/teacher/research/Instruments.tsx` (week picker, students x 6 tap grid saving on tap, feedback open/close, paper entry, summary bars), `apps/web/src/student/research/Feedback.tsx` (one question per screen, read aloud with `shared/speech.ts`, 3 big buttons with faces, thank-you screen), `apps/web/src/student/research/cards/FeedbackCard.tsx` (only when open and unanswered).

Tests: `server/test/research-instruments.test.ts` (upsert, uniqueness, closed 409, non-participant 404, summary counts, other school 404), web tests for the grid PUT and the 5-answer student flow. Run with `$env:TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/postgres'; $env:TEST_DB_NAME='shabd_test_f9'; npm test -w @shabd/server`, `cd apps/web; npx vitest run`, `npm run typecheck`, `npm run build; npm run check:bundle`.

Constraints: no free-text fields; no other features' files; English, child-friendly, 320 px.

Done: teacher records weekly observations in under 2 minutes per class and children answer the questionnaire in the app.

---

## 7. Answers this plan gives the judges

- **How do you measure improvement?** Same 30-mark scheme on two matched forms (F4), anonymised scores per child (F1), mean, SD, mean and % improvement, paired t-test with p-value and effect size per skill and in total (F8), optionally against a comparison class (Welch's t-test on gains).
- **How do you know they are not copying?** Tests are supervised, code-gated, timed and individually shuffled, with no answers on the device (F4). Answers can only be typed on the app's keyboard (no paste). Daily and test sentences are checked against the example, other children's sentences and the child's own repeated templates, with typing-speed signals, and a teacher confirms flagged ones (F5). The report gives an own-work rate.
- **Is the intervention what you say it was?** The exact 100-word list, 20 school days, and per-child completion records (F2, F7), plus observation and feedback instruments (F9).

## 8. Open decisions (defaults chosen)

| Question | Default |
|---|---|
| Does POS earn marks/XP in daily play? | No (measured only, keeps scoring stable) |
| Claude in assessment marking? | Never (rules only, reproducible) |
| Form order | A = pre, B = post; counterbalancing (half the class swaps) is P2 |
| Missed days (absence) | No catch-up mode; recall (F6) revises; completion rate reported |
| Researcher login | None; teacher/school-admin accounts; exports are anonymised |
| Per-student consent required by ethics? | Yes (F1); the existing class-level attestation remains |
