# REST API Contract (MVP)

Base URL: `/api` (Express on port 4000; Vite proxies `/api` from 5173). All bodies are JSON (`Content-Type: application/json`) except the CSV export.
The TypeScript types for every request and response are in `packages/core/src/api.ts` (names are given in brackets below). **The types are the source of truth**; this document explains behaviour. The typed client is `apps/web/src/shared/api.ts`.

## 1. Conventions

- **Auth:** `Authorization: Bearer <token>`. Tokens are opaque random hex strings stored in `auth_tokens`. Teacher tokens expire after 7 days, student tokens after 60 days (home phones stay logged in).
- **Errors:** every non-2xx response has the body `{"error": {"code": "...", "message": "..."}}` (`ApiError`). The codes are `bad_request` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `locked` (423), `not_implemented` (501) and `internal` (500). `message` is safe to show a teacher. The student UI shows its own friendly text.
- **Dates:** `YYYY-MM-DD` in **Asia/Kolkata** (`todayIST()` in core). The server decides "today" and does not trust the client's clock for dates. Timestamps are ISO-8601 UTC.
- **IDs:** teachers, classes, students and sessions use integers. Words use strings (`d001-1` for the bank, `c-12` for custom teacher words). Client-generated `clientId` values are UUIDs (`crypto.randomUUID()`).
- **Idempotency:** every student write carries a `clientId`, or is naturally idempotent (word and session completion). Re-sending is always safe, which is what makes the offline outbox work.
- **Authorization:** a teacher can only touch their own classes and students (otherwise 404). A student can only touch their own sessions (otherwise 404).
- **Validation:** wrong types, missing fields or out-of-range values return 400 with a message naming the field.

## 2. Auth

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /auth/teacher/register` | none | `TeacherRegisterReq` | 201 `TeacherAuthRes` |
| `POST /auth/teacher/login` | none | `TeacherLoginReq` | `TeacherAuthRes` |
| `GET /auth/classes/:classCode/roster` | none | - | `PublicRosterRes` |
| `POST /auth/student/login` | none | `StudentLoginReq` | `StudentAuthRes` |
| `GET /auth/me` | any | - | `MeRes` |
| `POST /auth/logout` | any | - | 204 (deletes the token) |

```jsonc
// POST /api/auth/teacher/register
{ "name": "Mrs. Patil", "email": "patil@school.in", "password": "min8chars", "inviteCode": "optional" }
// -> 201
{ "token": "9f2c…", "teacher": { "id": 1, "name": "Mrs. Patil", "email": "patil@school.in" } }
```
- Password ≥ 8 characters. A duplicate email returns 409. `inviteCode` is **required**: the joining school's teacher invite code (`ABCD-EFGH`, dashes and case ignored). Unknown, expired or revoked codes return 404. The old global `TEACHER_INVITE_CODE` env var is removed.
- Login with wrong credentials returns 401 `"Wrong email or password"`.

```jsonc
// GET /api/auth/classes/K7Q2MX/roster   (class code is case-insensitive)
{ "className": "5A", "students": [ { "id": 3, "firstName": "Riya", "avatar": "🦁" } ] }
// active students only, ordered by firstName. Unknown code -> 404.

// POST /api/auth/student/login
{ "classCode": "K7Q2MX", "studentId": 3, "pin": "0427" }
// -> 200
{ "token": "…", "student": { "id": 3, "classId": 1, "rollNo": 7, "firstName": "Riya", "avatar": "🦁", "active": true }, "className": "5A" }
```
- A wrong PIN returns 401 `"Wrong PIN"` and increments `failed_pin_count`. After 5 wrong PINs: 423 `locked` for 5 minutes. A correct PIN resets the counter.
- An inactive student, or a student not in that class, returns 404.

### 2.1 Onboarding v2 (schools, invites, class join) - summary

The full contract is `docs/ONBOARDING_SPEC.md` section 4 (it wins over this file). Key points:

- Hierarchy: super admin -> school -> teachers (`role` `teacher` or `school_admin`) -> classes -> students. Cross-school access always returns **404**.
- Public: `GET /join/class/:classCode` (name grid), `GET /join/school/:studentCode` (class tiles), `GET /invites/:code`, `POST /auth/school/setup` (principal, from a single-use setup link), `POST /auth/password-reset`. `POST /auth/student/login` now also returns `schoolName`, `classCode`, `firstLogin`. `GET /auth/classes/:classCode/roster` is kept as a deprecated alias.
- Teacher: `GET /teacher/overview` (checklist), `GET /classes/:id/share`, `POST /classes/:id/rotate-code`, `POST /classes` takes `standard` + `division`, `POST /classes/:id/students` takes up to 100 rows and `consentConfirmed`, roster rows carry `firstLoginAt`, `lastLoginAt`, `locked`, and `POST /students/:id/reset-pin` signs the child out everywhere.
- School admin (`/school/*`): school info and checklist, overview, teachers (turn off, role, reset link), teacher invites, classes (reassign, archive), audit log.
- Super admin (`/admin/schools*`, header `X-Admin-Secret`, env `SUPER_ADMIN_SECRET`, off when unset): list and create schools, make setup links, suspend or resume. CLI: `npm run admin -- create-school --name "..."`.
- New error code `rate_limited` (429). Student tokens last 60 days sliding, teacher tokens 7 days sliding.

## 3. Classes and roster (teacher)

| Method & path | Request | Response |
|---|---|---|
| `GET /classes` | - | `ClassRoom[]` (own classes, newest first) |
| `POST /classes` | `CreateClassReq` | 201 `ClassRoom` |
| `PATCH /classes/:classId` | `UpdateClassReq` | `ClassRoom` |
| `GET /classes/:classId/students` | - | `StudentWithPin[]` (ordered by rollNo, inactive included) |
| `POST /classes/:classId/students` | `AddStudentsReq` | 201 `StudentWithPin[]` (only the created ones) |
| `PATCH /students/:studentId` | `UpdateStudentReq` | `StudentWithPin` |
| `POST /students/:studentId/reset-pin` | - | `StudentWithPin` (new random PIN, unlocks) |

```jsonc
// POST /api/classes
{ "name": "5A", "startDate": "2026-11-20" }   // startDate optional, default today (IST)
// -> 201
{ "id": 1, "teacherId": 1, "name": "5A", "classCode": "K7Q2MX", "startDate": "2026-11-20", "leaderboardMode": "individual" }

// POST /api/classes/1/students   (the UI turns pasted "7, Riya" lines into this)
{ "students": [ { "rollNo": 7, "firstName": "Riya" }, { "rollNo": 8, "firstName": "Aarav" } ] }
// -> 201  [{ "id": 3, "classId": 1, "rollNo": 7, "firstName": "Riya", "avatar": "🦁", "active": true, "pin": "0427" }, …]
```
- `firstName` is trimmed, 1-30 characters. A duplicate rollNo in the class returns 409 (no partial insert, so the whole request is one transaction). The avatar is `AVATARS[(rollNo - 1) % 20]`. The PIN is random (`generatePin`). Maximum 60 students per request.
- `startDate` sets **content day 1** for the class: `dayIndex = dayIndexFor(startDate, date)` (wraps after 366). Changing it re-maps future days and keeps past sessions unchanged.
- To deactivate a student, send `PATCH /students/:id {"active": false}` (hard delete is out of scope).

## 4. Words and daily words (teacher)

| Method & path | Request | Response |
|---|---|---|
| `GET /words?q=&difficulty=&partOfSpeech=&tag=&dayIndex=&limit=&offset=` | query | `WordSearchRes` |
| `POST /words` | `CreateWordReq` | 201 `Word` (source `teacher`, id `c-<n>`) |
| `GET /classes/:classId/daily-words?date=` | query (date defaults to today) | `DailySet` |
| `PUT /classes/:classId/daily-words/:date` | `SetDailyWordsReq` | `DailySet` (source `teacher`) |
| `DELETE /classes/:classId/daily-words/:date` | - | `DailySet` (back to `auto`) |

- `q` matches a word prefix first, then a substring of the word or meaning (case-insensitive). Results are ordered by exact match, then prefix match, then `dayIndex`. `limit` defaults to 50 (maximum 200).
- `POST /words` validates the same rules as the content validator (word `^[a-z]{3,14}$`, meaning 2-12 words, example contains the word, 2 distinct distractors, `contextWords` 3-6). `meaningMarathi`, `syllables` and `tags` may be empty for teacher words.
- `PUT` needs exactly 5 distinct existing word IDs (400 otherwise). Bank and custom words can be mixed. Order = positions 1-5. It replaces any previous override for that date. **Sessions that have already started keep their own word snapshot** (`sessions.word_ids_json`).
- Auto set: the bank words with `day_index = dayIndexFor(class.startDate, date)`, ordered by id.

```jsonc
// GET /api/classes/1/daily-words?date=2026-11-20
{ "classId": 1, "date": "2026-11-20", "dayIndex": 1, "source": "auto",
  "words": [ { "id": "d001-1", "dayIndex": 1, "word": "kitchen", "partOfSpeech": "noun", "difficulty": 1,
               "meaning": "a room where food is cooked", "meaningMarathi": "स्वयंपाकघर",
               "exampleSentence": "Aai makes hot bhakri in the kitchen every morning.",
               "distractorMeanings": ["a place where you keep a car", "a room where you sleep"],
               "syllables": ["kit","chen"], "tags": ["home"], "contextWords": ["cook","food","mother","room"],
               "forms": [], "source": "bank" }, … 4 more ] }
```

## 5. Dashboard, leaderboard and analytics (teacher)

| Method & path | Response |
|---|---|
| `GET /classes/:classId/dashboard?date=` | `ClassDashboardRes` |
| `GET /classes/:classId/leaderboard?period=week\|all` | `LeaderboardRes` (all students, not only the top 10) |
| `GET /classes/:classId/analytics?from=&to=` | `ClassAnalyticsRes` (default window: the last 28 days up to today) |
| `GET /students/:studentId/analytics` | `StudentDetailRes` (all time) |
| `PATCH /classes/:classId {"leaderboardMode":"hidden"}` | switches the student leaderboard off |

Definitions (implemented in `server/src/services/analytics.ts`):
- **status:** `completed` when the session has `completed_at`, `in_progress` when a session exists, otherwise `not_started`. `wordsDone` = number of `word_scores` rows.
- **xpWeek:** sum of `xp_ledger.amount` with `week_start = weekStart(today)` (Monday). **xp all:** sum over all rows.
- **Leaderboard rank:** ordered by XP descending; ties share a rank and are ordered by firstName.
- **spellingStrength:** among words with a `word_scores` row, the % with `spell_first_try = 1`.
- **sentenceStrength:** mean `raw_total / 40 × 100` over counted submissions (the best submission per word).
- **spellingErrorCounts:** counts of `primary_error` over **wrong** spell attempts (`is_correct = 0`).
- **sentenceErrorCounts:** counts of each code in `error_codes_json` over all submissions, including gated ones (so `SN_WORD_MISSING` is visible).
- **Class rate** for a code = the class's total count for that code / the class's total relevant events. **weaknessLabels:** see the doc comment in `analytics.ts` (at least 10 events, ≥ 1.5× the class rate, at most 2 labels).
- **hardestWords:** words with ≥ 3 students attempting them, ordered by first-attempt accuracy ascending, at most 10.

## 6. CSV export (teacher)

`GET /classes/:classId/export.csv?type=attempts|sentences|daily|students`. The response is `text/csv; charset=utf-8` with a UTF-8 BOM (so Excel opens it correctly) and `Content-Disposition: attachment; filename="5A-attempts-2026-11-20.csv"`. Students are identified by `roll_no` + `first_name` (teacher use; an anonymised research export is out of scope for the MVP).

| type | Columns |
|---|---|
| `attempts` | date, roll_no, first_name, word, stage, attempt_no, input_text, is_correct, primary_error, error_tags (`;`-joined), hints (`;`), audio_plays, ms_elapsed, client_ts |
| `sentences` | date, roll_no, first_name, word, submission_no, text, gate, counted, r_use, r_grammar, r_relevance, r_length, raw_total, final_marks, error_codes (`;`), evaluator, confidence, tip |
| `daily` | date, roll_no, first_name, word_position, word, spelling, meaning, sentence, total, stars, spell_first_try |
| `students` | roll_no, first_name, sessions_completed, xp_total, streak_current, streak_best, spelling_strength, sentence_strength, top_spelling_error, top_sentence_error, weakness_labels |

## 7. Student flow

| Method & path | Request | Response |
|---|---|---|
| `GET /student/home` | - | `StudentHomeRes` |
| `POST /student/sessions/today` | `{}` | `TodaySessionRes` (creates the session or returns the existing one) |
| `POST /student/sessions/:sessionId/attempts` | `AttemptsReq` | `AttemptsRes` |
| `POST /student/sessions/:sessionId/sentences` | `SentenceReq` | `SentenceRes` |
| `POST /student/sessions/:sessionId/words/:wordId/complete` | `{}` | `CompleteWordRes` (= `WordScore`) |
| `POST /student/sessions/:sessionId/complete` | `{}` | `SessionSummaryRes` |
| `GET /student/leaderboard` | - | `LeaderboardRes` (week, top 10 + `me`; `mode: "hidden"` → `entries: []`) |

**Session lifecycle.** `POST /sessions/today` snapshots today's 5 word IDs into the session (unique per student per date). In the MVP there is only "today" mode; catch-up and practice are cut. If a child opens the app after midnight on a session started the day before, `/student/home` shows the new day. The old session can still receive queued writes (for idempotent sync) but cannot be resumed from the UI.

```jsonc
// POST /api/student/sessions/12/attempts   (the client batches; the outbox may resend)
{ "spell": [ { "clientId": "6f1…", "wordId": "d001-2", "attemptNo": 1, "input": "wisper", "hints": [],
               "audioPlays": 2, "msElapsed": 8400, "clientTs": "2026-11-20T10:01:02.000Z" } ],
  "meaning": [ { "clientId": "a77…", "wordId": "d001-2", "attemptNo": 1, "chosen": "to speak very softly",
                 "isCorrect": true, "msElapsed": 3100, "clientTs": "…" } ] }
// -> 200
{ "accepted": ["6f1…", "a77…"],
  "classifications": { "6f1…": { "isCorrect": false, "tags": ["SP_SILENT"], "primary": "SP_SILENT", "editDistance": 1 } } }
```
- The server **re-derives** `is_correct` for spelling (`classifySpellingError`, case-insensitive and trimmed) and ignores client opinion. For meaning it trusts `isCorrect` but checks that `chosen` is one of the 3 options. On the final meaning attempt row it sets `primary_error` to `MN_WRONG_1` (correct on 2nd) or `MN_WRONG_2`.
- A `clientId` that already exists is skipped but still listed in `accepted`. A word not in the session's snapshot returns 400. Limits: spell `attemptNo` ≤ 3, meaning ≤ 2.

```jsonc
// POST /api/student/sessions/12/sentences
{ "clientId": "c3…", "wordId": "d001-2", "submissionNo": 1, "text": "I whisper to my friend in class.",
  "starterHintUsed": false, "msElapsed": 42000, "clientTs": "…" }
// -> 200
{ "evaluation": { "gate": "ok", "rubric": { "use": 10, "grammar": 10, "relevance": 12, "length": 4 }, "rawTotal": 36,
                  "errorCodes": [], "confidence": 0.9, "evaluator": "rules-1",
                  "feedback": [ { "key": "used_word", "ok": true, "message": "You used the word!" }, … ],
                  "tip": "Try adding why you whisper, using 'because'." },
  "counted": true, "finalMarks": 36 }
```
- The server evaluates with `services/sentenceEvaluator.ts`: rules, then Claude if `ANTHROPIC_API_KEY` is set, falling back to rules on any error or after a 6-second timeout. A gate other than `ok` returns `counted: false` and `finalMarks: null`. The row is still stored (for analytics), and the child may try again without using up a submission.
- At most 2 **counted** submissions per word. A 3rd counted one returns 409. Submission 2 gets the 0.8 multiplier. If the same `clientId` is sent again, the stored result is returned without re-evaluating.
- Offline: the client shows its own `evaluateSentenceRules` result immediately, queues the request with `clientEvaluation`, and the server's result (which may differ) is what counts.

**Word completion** (`.../words/:wordId/complete`) is sent after Stage 3 of each word (or after the child gives up). The server computes the `WordScore` from the stored rows (`services/scoringService.ts#completeWord`) and upserts it. **Session completion** writes the streak, XP ledger rows, `total_marks` and `xp_awarded`, and returns the summary. Both are idempotent.

```jsonc
// POST /api/student/sessions/12/complete -> 200
{ "sessionId": 12, "date": "2026-11-20",
  "wordScores": [ { "wordId": "d001-1", "spelling": 40, "meaning": 20, "sentence": 36, "total": 96, "stars": 3 }, … ],
  "totalMarks": 365, "xp": { "wordMarks": 365, "completionBonus": 25, "streakBonus": 20, "perfectBonus": 0, "total": 410 },
  "streak": { "current": 4, "best": 6, "lastCompletedDate": "2026-11-20" }, "xpTotal": 3120,
  "level": { "level": 3, "xpIntoLevel": 120, "xpForNextLevel": 2000 } }
```

`GET /student/home` example:
```json
{ "student": { "id": 3, "classId": 1, "rollNo": 7, "firstName": "Riya", "avatar": "🦁", "active": true },
  "className": "5A", "leaderboardMode": "individual",
  "today": { "date": "2026-11-20", "dayIndex": 1, "status": "in_progress", "wordsDone": 2, "sessionId": 12 },
  "streak": 3, "bestStreak": 6, "xpTotal": 2710, "xpWeek": 820,
  "level": { "level": 2, "xpIntoLevel": 1210, "xpForNextLevel": 1500 } }
```

## 8. Other

- `GET /health` returns `{"ok": true, "ai": false, "version": "0.1.0"}` (`ai` is true when the Claude key is configured).
- An unknown `/api/*` path returns 404 JSON. Request bodies are limited to 256 KB.
- Rate limiting: only the student PIN lockout (enough for a closed pilot).
