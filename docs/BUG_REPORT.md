# Shabd Mitra (avishkar-vocab-app): QA Bug Report

**Date:** 2026-11-21 | **Build:** git `41b0d57` + uncommitted `.gitignore`/lockfile edits | **Version:** 0.1.0
**Environment:** Windows 11, Node v26.13.1 (repo asks for 22.x), PostgreSQL 17 (local), `npm run dev` (API :4000, Vite :5173), AI evaluator off (rules only).
**Method:** Walked the whole app in the built-in browser as a **student** (375×812 and 360×640 phones) and as a **teacher** (desktop and phone), then reproduced and measured suspicious behaviour with API calls and by running the real core/web functions. Each bug below says how it was confirmed.

**Confirmation key:** ✅ reproduced in the running app · 🧪 reproduced by running the real code/API · 📖 found by reading code, not reproduced at runtime.

---

## Summary

| ID | Sev | Role | Title | Confirmed |
|---|---|---|---|---|
| B-01 | High | Student/Teacher | A completed session can still be changed; scores no longer add up | 🧪 |
| B-02 | High | Student | Offline summary shows streak "1 day" and wrong XP for a child with a streak | ✅ |
| B-03 | High | Teacher (security) | No rate limit or lockout on teacher login | 🧪 |
| B-04 | High | Student | Low-effort sentences earn big marks (one word = 24/40; starter-only ≈ 22/40) | 🧪 |
| B-05 | Medium | Student | "Help me start" teaches wrong English (111 "a + vowel" nouns, "a information") | 🧪 |
| B-06 | Medium | Student | Sentence result screen: "Next word" is off-screen, no marks shown, "Try again" offered after a perfect sentence | ✅ |
| B-07 | Medium | Student | "Checking…" can hang forever on a flaky connection | 📖 |
| B-08 | Medium | Student | One bad outbox item blocks every later save | 📖 |
| B-09 | Medium | Teacher (security) | Teacher sign-up is open when no invite code is set | ✅ |
| B-10 | Medium | Teacher | Picking a duplicate word looks like a dead button (error shows 600px away) | ✅ |
| B-11 | Medium | Teacher | "Add students" accepts names the server rejects, with a developer-style error | ✅ |
| B-12 | Low | Student | Example sentence highlights unrelated words (category, Happiness, runway) | 🧪 |
| B-13 | Low | Student | Keyboard never capitalises "I"; checker doesn't flag it | ✅ |
| B-14 | Low | Student | Names truncated on the 375px login screen ("Ana…", "Ved…") | ✅ |
| B-15 | Low | Student | Learn "Next" is disabled for 3 s with no explanation | ✅ |
| B-16 | Low | Student | Summary: stale after sync, hard-coded "+1" | ✅ |
| B-17 | Low | Teacher | Analytics/dashboard layout: key columns off-screen, ambiguous labels | ✅ |
| B-18 | Low | Dev | Web tests fail on Node 26; `npm run dev` needs a pre-created DB | ✅ |

---

## High severity

### B-01: A completed session can still be changed; scores no longer add up
- **Where:** `server/src/routes/student.ts` (`attempts`, `sentence`, `completeWordRoute`), `server/src/services/scoringService.ts` (`completeWord`)
- **Steps:** Complete a full session via the API (all 5 words), so `total_marks` = 300. Then post a spell attempt with both hints for word 1 and call `POST /student/sessions/:id/words/:wordId/complete` again.
- **Actual:** The word's score drops 60 → 40. `GET`/re-complete of the session now returns `wordScores` summing to **280** while `totalMarks` and the XP ledger stay **300**. Anything reading `word_scores` (CSV "daily" export, per-word views) now disagrees with the summary and leaderboard.
- **Expected:** Once `completed_at` is set, attempts/sentences/word-completion should be rejected (409) or ignored.
- **Impact:** A child (or anyone with a student token) can rewrite finished history; teachers see inconsistent numbers.
- **Fix:** In `ownSession()` (or each write route) return 409 when `session.completed_at` is set. Add a regression test beside the existing "idempotent" flow test.

### B-02: Offline summary shows "1 day" and wrong XP for a child with a streak
- **Where:** `apps/web/src/student/Summary.tsx` (builds `prev` with `lastCompletedDate: null`) → `safe-core.ts` `localSummary` → `updateStreak`
- **Steps:** Student with a 10-day streak (completed yesterday). Finish today's last word with the network cut. Open the summary.
- **Actual (live UI):** "**1 day +1**", streak bonus **+5**, XP today **438**. After reconnecting and reloading the page the real values appear: **11 days**, **+50**, **483**. The open page never updates by itself.
- **Expected:** Same numbers online and offline (or a clear "estimate").
- **Cause:** `updateStreak` treats `lastCompletedDate: null` as "no previous streak", so the streak restarts at 1.
- **Fix:** Cache the whole `StreakState` (incl. `lastCompletedDate`) from the last `/student/home` response, or hide streak/XP lines in local mode and show "Saving your stars…" until synced.

### B-03: No rate limit or lockout on teacher login
- **Where:** `server/src/routes/auth.ts`
- **Steps:** Send 25 wrong passwords to `POST /auth/teacher/login`, then the correct one.
- **Actual:** 25 × `401`, then `200`. Nothing slows or locks. Class-code lookups (`GET /auth/classes/:code/roster`, unauthenticated, returns children's first names) are also unthrottled (60 random codes, all instant `404`).
- **Impact:** Password guessing on a production teacher account; class-code enumeration exposes student names.
- **Fix:** Per-IP and per-email throttling (e.g. 5 failures then 15-min backoff); rate-limit the roster endpoint. (Student PIN lockout already works: 5 wrong → `423`.)

### B-04: Low-effort sentences earn big marks
- **Where:** `packages/core/src/sentence.ts`, `apps/web/src/student/play-logic.ts` (`starterFor`)
- **Measured with the real evaluator (word "warm" unless noted):**

  | Submission | Marks (of 40) |
  |---|---|
  | `Warm.` (one word) | 24 |
  | `warm warm warm warm warm warm warm warm` | 24 |
  | `It is warm today. It is warm today.` | 32 |
  | Example sentence copied verbatim from the Learn screen | 20 |
  | **Only the "Help me start" starter, nothing added** (all 1830 words) | **avg 21.9 net after the −5, range 17–27** |

- **Impact:** The −5 starter "penalty" is a net gain: it supplies the target word, which alone earns the 10 "word used" marks plus grammar marks. A child can take ≈55% of the sentence marks with zero writing, which weakens the learning signal and the leaderboard.
- **Fix:** Require ≥ 4 distinct words and a verb before awarding `use`; penalise repeated tokens/sentences; make starter-only text (unchanged starter) score 0; reduce credit when `SN_COPIED`.

---

## Medium severity

### B-05: "Help me start" teaches wrong English
- Starter is `I saw a <word>` for every noun. **111 nouns** produce "a" before a vowel ("I saw a eyelash / attic / island / onion / alarm") and uncountable nouns produce "I saw a information / luggage / advice / honey / laughter". Adjective starters are fragments ("The warm").
- **Fix:** Pick a/an from the first sound, skip the article for uncountable nouns, or use per-word starters from the content files.

### B-06: Sentence result screen is hard to finish
Seen at 375×812 (🧪 measured in the browser):
1. **"Next word ▶" is below the fold** (button top 826px > 812px viewport; page scrolls 1104px) because the keyboard's bottom padding (`with-keyboard`) is still applied after the keyboard disappears. On smaller phones it is worse.
2. **No marks are shown** for the sentence (no "+36", no stars), only a checklist.
3. A perfect sentence (all ✅) still shows **"Try again (better score)"**.
- **Fix:** Drop `with-keyboard` in the result view, show the score, hide "Try again" when there is nothing left to improve.

### B-07: "Checking…" can hang forever
- `WriteStage.submit()` awaits `flush()` **before** the 7-second `Promise.race` starts, and `fetch` has no timeout. With queued items on a stalled connection the spinner never resolves. (📖 not reproduced at runtime.)
- **Fix:** Put the whole `flush()` + post inside the race, add an `AbortController` timeout in `api.request`.

### B-08: One bad outbox item blocks every later save
- `keepOnError()` returns `true` for any non-`ApiRequestError` (e.g. a JSON `SyntaxError`), so that item is retried forever and the FIFO queue never moves. (📖)
- **Fix:** Count tries and drop or park an item after N non-network failures.

### B-09: Teacher sign-up is open without an invite code
- With `TEACHER_INVITE_CODE` unset, `POST /auth/teacher/register` returned `201` and a token for an arbitrary email. The README says to set it in production, but nothing warns or blocks.
- **Fix:** Refuse to start (or log a loud warning) in production when the code is empty.

### B-10: Duplicate-word error is invisible
- Teacher › Words › Change › "Use this" on a word already in today's set does nothing visible. The message ("… is already in today's set") renders at the bottom of the page (y≈1293) while the picker is at y≈680, so it is off-screen. Looks like a broken button.
- **Fix:** Show the error inside the picker, or disable/label words already used.

### B-11: "Add students" accepts what the server rejects
- The preview shows no problem with a 60-character name, then Save fails with `students[1]: firstName must be 1-30 characters` (zero-based index that doesn't match the preview's line numbers).
- **Fix:** Validate the 30-character limit in `parseRosterText` and report "Line 2: name is too long (max 30)".

---

## Low severity / UX

- **B-12 Highlight false positives:** `highlightParts` uses a prefix match, so "cat" highlights *category*; "happy" highlights *Happiness* and *happen*; "run" highlights *runway* (🧪).
- **B-13 Lowercase "i":** The keyboard has shift but no auto-capitalisation of the pronoun "I"; "…because **i** lost mine." still gets every ✅ including "Great, a capital letter!" (✅).
- **B-14 Truncated names:** On 375px the class roster cuts "Ananya" → "Ana…" and "Vedant" → "Ved…" (✅). Similar-looking names are a real risk for 5th graders; allow two-line names or a smaller font.
- **B-15 Learn "Next" disabled for 3 s:** Greyed out with no countdown or hint; looks broken (✅).
- **B-16 Summary page:** Streak line always shows a hard-coded "**+1**"; the page does not refresh after the outbox syncs (stale "☁️ will sync") (✅). 📖 Code also enqueues `completeSession` and then calls it directly on first visit (idempotent, so harmless). The doubled `/complete` and `/home` calls seen in the dev network log are most likely React StrictMode, not a bug.
- **B-17 Teacher layout:**
  - Analytics table is 1638px wide: the **Weakness** column (the key output) is far right, and the student-name column is not sticky, so names vanish when scrolling.
  - "Hardest words": "67% right first time · **3 attempts**" is ambiguous (it means 3 students).
  - On a phone the nav wraps to 3 rows and Marks/Streak/XP columns scroll out of view.
  - Dates mix formats (`21-11-2026` pickers vs `2026-11-21` text).
- **B-18 Developer setup:**
  - `apps/web` tests fail on Node 26 (14 failures; `localStorage` undefined) because Node's experimental global `localStorage` shadows jsdom's; they pass with `NODE_OPTIONS=--no-experimental-webstorage`. `package.json` says Node 22.x.
  - `npm run dev` crashes with `database "shabd" does not exist` on a fresh Postgres; the README implies it creates everything.
  - Minor code smells: unused `fromServer` in `Play.tsx`; `freshState` hard-codes 5 words.

---

## Checked and working (no bug)

Student login (class code case-insensitive, friendly "Class not found", PIN pad, wrong-PIN message, 5-try lockout with `423`), expired token → back to "Who are you?" with progress kept, resume mid-word after reload, spelling retries (green-letter hint on attempt 2, copy mode on attempt 3), letter tiles (one-use tiles, shuffled), first-letter hint, meaning check with give-up reveal, sentence gates (empty / word missing / PII), offline sentence scoring with "waiting to save" chip and later sync, leaderboard (student and teacher agree), home states (not started / continue / done), 360×640 layout with keyboard.
Teacher login errors, route protection and logout, dashboard numbers, class creation and validation, roster paste validation (duplicates, bad lines, tabs), HTML/emoji/Devanagari names rendered safely, PIN reset confirmation, deactivate hides student from login and cards, login cards, per-student detail, analytics values, today's-word picker, CSV endpoints return 200 with headers.

## Not covered
Real speech audio (browser TTS output not verified), real Android devices and Hindi/Marathi system fonts, PWA install/service-worker offline, print preview of cards, browser CSV download (endpoints checked via API only), Claude AI evaluator (off), production/Vercel deployment.

## Local data created by this test (dev DB `shabd`, safe to delete)
Database `shabd` created; Aarav and Riya have completed sessions for 2026-11-21 (Riya also given a 10-day streak directly in the DB); Sai has an in-progress session; Kabir's PIN is locked for 5 minutes; class "QA Class" (code YCACMA) with 5 test students (one deactivated); teacher `qa-tester@example.test`.

---

## Fix status (2026-11-21)

All 18 items were addressed in the working tree (nothing committed). After the fixes: typecheck clean; core 117, web 53, server 61 tests pass; `validate:words` OK. B-01, B-03, B-06, B-10, B-11, B-14 and B-17 (and the B-04 starter gate and B-13 capital "I") were also re-checked in the running app.

| ID | Fix | Test added |
|---|---|---|
| B-01 | Finished sessions reject new attempts/sentences (409); re-completing a word returns the stored score | `flow.test.ts` freezes a finished session |
| B-02 | `streakBeforeSession()` rebuilds the previous streak date from cached home data | `logic.test.ts` offline summary |
| B-03 | DB-backed throttle (`server/src/throttle.ts`, migration 2): 8 wrong passwords per email / 30 per IP / 100 unknown class codes per IP in 15 min lock for 15 min (429) | 3 tests in `auth.test.ts` |
| B-04 | One/two-word answers earn no relevance and capped grammar; mostly-repeated words earn no relevance/length; the unchanged "Help me start" opening is a new `starter_only` gate. **Not changed:** copying the example sentence still scores 20/40 (PRD rule; say if you want it lower) | `sentence.test.ts` + updated fixture |
| B-05 | `starterFor` moved to core; nouns use "the" ("I saw the island / the information") | `logic.test.ts` |
| B-06 | Keyboard padding removed on the result screen, score shown, "Try again" hidden when nothing to improve, action buttons sticky | live check |
| B-07 | 15 s request timeout (`api.ts`); sentence 7 s limit now covers the queue flush too | n/a (timing) |
| B-08 | Outbox drops an item after 5 unexpected failures so it can't block the queue | `outbox.test.ts` |
| B-09 | Production sign-up is closed unless `TEACHER_INVITE_CODE` is set | `auth.test.ts` |
| B-10 | Words already in the day show a disabled "Already in this day"; pick errors appear inside the picker | live check |
| B-11 | Roster paste validates the 30-letter limit with the right line number | `util.test.ts` |
| B-12 | Highlight uses the evaluator's accepted forms only (`category`, `happen`, `runway` no longer match) | `logic.test.ts` |
| B-13 | Keyboard turns a lone "i" into "I" on space/punctuation | `keyboard.test.ts` |
| B-14 | Roster tiles show full names (tighter padding, scaled font) | live check |
| B-15 | Disabled Learn button reads "Read the word first…" | n/a |
| B-16 | "+1" removed; offline summary re-asks the server every 5 s until real numbers arrive | n/a |
| B-17 | Name column sticky, Weakness moved next to the strengths, "N students" label, one-row scrolling nav on phones. **Not changed:** date format mix (native date pickers vs ISO text) | live check |
| B-18 | `apps/web/src/test-setup.ts` fixes storage on Node 26; `npm run dev` creates a missing local database; `.env.example` model default aligned with README | all web tests pass without flags |
