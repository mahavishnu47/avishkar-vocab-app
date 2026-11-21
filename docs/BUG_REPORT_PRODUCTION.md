# Production bug report: Shabd Mitra (hosted version)

**Tested:** 2026-11-21 on https://avishkar-vocab-app.vercel.app (master = onboarding version at `1f81b92`, no QA fixes). Mobile 375×812 for the child, desktop 1100×800 for teacher and principal, plus API fuzzing.
**Method:** acted as a careless 10-year-old, a careless teacher and a careless principal: button mashing, double-taps, Back, weird links, corrupted phone storage, junk input, simultaneous requests.
**Legend:** ✅ reproduced live on production · 📖 from code reading · ⚠️ could not reproduce (needs your device). Severity: Critical / High / Medium / Low.
**Work through the list top to bottom; each item has an ID, steps, expected/actual and a fix.** Tick the box when done.

---

## 0. The PWA problem you reported (P-1) ⚠️

> "After I log in as a student in the mobile PWA and remove it from recent apps, I land on the page asking whether I'm a teacher, school or student."

- [ ] **P-1 (High): installed app forgets the child after being swiped away.**
  - **What the app does on launch:** `/` shows the three-button chooser only when it finds **zero saved profiles** in `localStorage`. One saved profile goes straight to Home. So the phone is losing (or never keeping) that data.
  - **What I tested:** a fresh launch in a normal browser (new session at `/`) goes straight to the child's Home. Nothing in the code deletes profiles. I could not reproduce it on desktop; I need your phone details to pin it down.
  - **Gaps in the code that make this likely on phones:**
    1. The app never asks the browser to keep its storage (`navigator.storage.persist()` is not called anywhere), so the phone is free to clear it.
    2. No iOS support markup: no `apple-touch-icon`, no apple web-app meta tags in `index.html`. On iPhone, the home-screen app has its **own separate storage** from Safari, so a child who logged in in Safari (or the WhatsApp browser) and then installed starts empty.
    3. The manifest only lists an SVG icon (no 192/512 PNG), which some Android versions treat as a shortcut, not a real installed app.
    4. Everything about "who am I" lives in one place (`localStorage`). If it is empty the child is shown a screen meant for strangers.
  - **Fix, in order:** (a) call `navigator.storage.persist()` after every login; (b) add PNG icons + iOS meta tags; (c) when storage is empty but the device has been used before (remember a tiny flag in a cookie and IndexedDB too), show "Welcome back! Type your class code" instead of the three-role chooser; (d) add an install hint that says "log in *after* installing" on iPhone.
  - **To confirm:** tell me the phone model, Android/iPhone, browser, and whether you installed from Chrome/Safari or from a WhatsApp link, and whether you logged in *before* or *after* installing.

---

## 1. Child / student

- [ ] **K-1 (Critical) ✅ Opening the Summary page finishes the whole day.**
  - **Steps:** child plays part of word 1, then opens `/summary` (bookmark, a typed link, a restored tab, or a stray tap).
  - **Actual:** the day is marked **completed**: Home says 5/5 done, streak +1, 174 XP, and words 3–5 score **0**. The child cannot play today's words again. (Reproduced with Riya: `wordsDone 5, streak 1, xpTotal 174, scores 84/60/0/0/0`.) `/play` then bounces to the summary too.
  - **Cause:** `Summary.tsx` calls "complete session" whatever the progress; the server fills missing words with 0 and awards completion XP.
  - **Fix:** server refuses to complete a session unless all 5 words are completed (409); the Summary page sends unfinished children back to `/play`. Add a test.
- [ ] **K-2 (High) ✅ Blank white screen, and it stays blank.**
  - **Steps:** (simulating damaged phone storage) set `shabd.profiles.v1` to `[null]`, or `shabd.home.<id>` to `{"student":null}`, and open `/`.
  - **Actual:** completely white screen. Because the bad data is saved on the phone, it is white **every time** until the site data is cleared. There is no error boundary anywhere in the app.
  - **Fix:** add a top-level error boundary with a big "Start again 🦜" button that clears only this app's saved data; make `getProfiles()` and the home-cache readers validate their data.
- [ ] **K-3 (Medium) ✅ Mashing "Check" wastes all attempts instantly.**
  - **Steps:** type one letter, tap Check 20 times quickly.
  - **Actual:** all 3 spelling attempts are used in about a second, the answer is revealed, spelling score 0. Tapping all three meaning choices fast does the same (2 wrong → answer shown, 0 marks).
  - **Fix:** ignore a repeat Check unless the answer changed, and add a short cool-down after each wrong try.
- [ ] **K-4 (Medium) ✅ Starter-only and one-word sentences still score** (carried over from the earlier report, B-04). "The warm" (the unchanged "Help me start") is scored instead of rejected; "Warm." earns 24/40.
- [ ] **K-5 (Medium) ✅ Sentence result screen** (carried over, B-06). No marks shown, "Try again" shown even for a perfect sentence, and **"Next word" is cut off at the bottom** of a 375×812 phone (button top at y=800).
- [ ] **K-6 (Low) ✅ `/summary?s=<bad id>` says "No internet. Your work is saved 🙂"** although the real problem is a 404.
- [ ] **K-7 (Low) ✅ A lowercase "i" is never capitalised or flagged** (carried over, B-13).
- [ ] **K-8 (Low) 📖 Other carried-over play bugs:** no request timeout so "Checking…" can hang (B-07); unreadable queued saves retry forever (B-08); wrong word highlighting in the example sentence (B-12); Learn "Next" greyed 3 s with no explanation (B-15).

## 2. Teacher

- [ ] **T-1 (Medium) ✅ Double-clicking "Create class" makes duplicate classes.**
  - **Steps:** pick 7 and B, click Create class 4 times fast. **Actual:** two identical "7B" classes. Through the API, 10 simultaneous requests created **8** copies. The class picker then shows several identical names.
  - **Fix:** disable the button while saving; add a database uniqueness rule (school + standard + division + year).
- [ ] **T-2 (Low) ✅ Absurd class start dates are accepted** (`1800-01-01`, `9999-12-31`).
- [ ] **T-3 (Low) ✅ Words page always says "Today's words"**, even when the date is the year 9999.
- [ ] **T-4 (Low) ✅ `/teacher/classes/abc/roster`** shows `NaNNaN` in the header and a bare "Not found".
- [ ] **T-5 (Low) ✅ Add students: one bad line silently disables Save, and a junk line becomes a student named "a"** (carried over, N-3/N-4 from the pre-merge list).
- [ ] **T-6 (Medium) ✅ Teacher invite link has no limit.** 15 strangers registered with one link at the same time and all succeeded (34 uses in this test). If the WhatsApp link leaks, anyone becomes a teacher in the school. **Fix:** optional use limit, daily cap, and/or principal approval.

## 3. Principal / school admin

- [ ] **Pr-1 (Low) ✅ School-name length is counted wrongly for emoji.** 51 emoji (51 characters) is rejected with "name must be 1-100 characters" because the check counts 2 units per emoji.
- [ ] **Pr-2 (Low) ✅ Teachers list has no paging or search** (35 rows after my flood test) and the audit feed shows noise like "Mass8 invite redeem".
- Held up well: principal cannot turn off or demote themselves ("Your school needs at least one admin"), one-use setup link redeemed 6 times at once → exactly 1 success, 10 simultaneous PIN resets all consistent, duplicate email/roll races → clean 409s.

## 4. Server (any role)

- [ ] **S-1 (High) ✅ A null character in text crashes the request (HTTP 500).**
  - **Where:** class name, student name (add and edit), word search, school rename, and teacher login email. Plain `\u0000` in any text field.
  - **Fix:** reject `\u0000` once, centrally (in `reqString` in `server/src/validate.ts`).
- [ ] **S-2 (Medium) ✅ A very large number in a URL crashes the request (HTTP 500)** (e.g. `/api/classes/999…9/students`, `/api/school/teachers/999…9`). **Fix:** range-check IDs to the database integer limit in `idParam`/`reqInt`.
- [ ] **S-3 (Low) ✅ Raw server text reaches users:** `/school/setup/%20` shows "Unknown API route".
- [ ] **S-4 (Medium) ✅ Per-network PIN lockout** (carried over, N-1): about 60 wrong PINs on one Wi-Fi lock out every child, even with the right PIN.
- [ ] **S-5 (Medium) ✅ Faked `X-Forwarded-For` bypasses IP limits** (carried over, N-2). Safe on Vercel, not elsewhere.

## 5. Setup and hosting
- [ ] **H-1 (Medium) ✅ Environment variable values can start with an invisible BOM character** (it happened with my first `PUBLIC_APP_URL` and `SUPER_ADMIN_SECRET`, broken links and a "wrong secret"). The server should trim values.
- [ ] **H-2 (Low) ✅ Stale installed copy:** the service worker caches the old app, so people can keep seeing the previous version after a deploy (it hid the new onboarding from you).

---

## Suggested order to tackle them
1. **K-1** (data corruption), **S-1/S-2** (500s), **K-2** (white screen): small, high impact.
2. **P-1** after you send the phone details.
3. **K-3, T-1, T-6, S-4, S-5, K-4, K-5.**
4. Everything Low.

## Test data I left on production (suspend from `/admin`; no delete exists)
School "QA TEST SCHOOL (delete me)" with ~34 junk teachers (`mass*`, `race*`@example.test), 11 junk classes, ~20 students; school "RACE SCHOOL (delete me)".
Logins: `qa.principal@example.test` / `QaPrincipal#2026`, `qa.teacher@example.test` / `QaTeacher#2026`. Class code `GJ3ZVP`.

---

## Fix status (after the fixing pass)

Typecheck clean; core 122, web 121, server 134 tests pass. **Nothing is deployed yet.** Production needs **migration 3** applied first (`npm run db:migrate` with the direct Neon URL); it archives duplicate classes (keeps the oldest) and adds a uniqueness rule.

| ID | Status | What changed |
|---|---|---|
| K-1 | Fixed | Server refuses to finish a day until all 5 words are finished (409); Summary sends unfinished children back to their words and sends pending saves first. New test. |
| K-2 | Fixed | Saved data is validated (bad profiles/home cache ignored) and a top-level error screen ("Try again" then "Start fresh") replaces the white screen. New tests. |
| S-1 | Fixed | Central filter rejects null characters in body, query and URL with a 400. New tests. |
| P-1 | Fixed in code, **needs your phone to confirm** | Asks the browser to keep storage, PNG icons + iPhone meta tags, a "Welcome back" screen when the phone remembers a child but lost the profile, faster service-worker updates. |
| S-2 | Fixed | IDs above the database limit are a 404. New tests. |
| K-3 | Fixed | 0.8 s pause between spelling tries, same wrong answer is not a new try, 0.6 s pause between meaning taps. |
| T-1 | Fixed | Button locked instantly + database uniqueness rule (migration 3). New concurrency test. |
| T-6 | Fixed | Teacher invites default to 30 uses (max 500). |
| S-4 | Fixed | Network-wide wrong-PIN limit raised 60 → 600 (each child keeps their own 5-try lock); message says "Wi-Fi". |
| S-5 | Fixed | Only one proxy hop is trusted on Vercel, none elsewhere. |
| K-4 / K-5 / K-7 / K-8 | Fixed | Earlier QA fixes restored: starter-only and one-word sentences rejected, marks shown, sticky "Next word", "I" capitalised, request timeouts, queue poison items, word highlighting, Learn button label. |
| K-6 | Fixed | A missing day says "We can't find that day", not "No internet". |
| T-2 | Fixed | Class start date must be 2020 → one year ahead. |
| T-3, T-4 | Fixed | Words heading follows the date; bad class links show a friendly page (no "NaNNaN"). |
| T-5 | Fixed | A reason is shown when Save is disabled; a pasted sentence is not accepted as a name. |
| Pr-1 | Fixed | Name lengths count characters people see (emoji = 1). |
| Pr-2 | **Not done** | Teachers list paging/search and audit noise. |
| S-3 | Fixed | "Unknown API route" is replaced by a friendly message. |
| H-1 | Fixed | The server cleans BOMs, spaces and quotes from key environment values. |
| H-2 | Fixed | Service worker takes over at once after a deploy. |
