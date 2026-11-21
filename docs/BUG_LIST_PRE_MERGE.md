# Bug list: onboarding version before my merge (commit 1f81b92)

Run on a clean database with SUPER_ADMIN_SECRET set. Tests: typecheck clean, core 118, server 123 pass; web 105 pass only with `NODE_OPTIONS=--no-experimental-webstorage` (on Node 26 default settings 56 web tests fail on localStorage).
Legend: ✅ reproduced in the running app/API, 📖 from code reading, ♻ old bug still present (the onboarding commits never touched those files).

## Onboarding: working as designed
Super admin gate and wrong-secret message, create school with validation, one-time setup link, school dashboard checklist, teacher invite and join (case-insensitive duplicate email), class creation, smart paste (header skipped, first names only, duplicate names get roll numbers), consent gate, share/QR/WhatsApp text, student `/j/`, `/s/` links with kind errors, PIN pad, welcome tour, "Who's playing?" on 2+ profiles, tenant isolation (all cross-school access is 404), PIN reset signs child out, turn teacher off/on, last-admin guard, single-use reset links, code rotation, join-disabled/archived/suspended blocks.

## New bugs
| # | Sev | Bug |
|---|---|---|
| N-1 | High | ✅ PIN rate limit is per IP, not per student: 60 wrong PINs in 10 min from one IP (one classroom Wi-Fi or a shared mobile-carrier IP) makes every other child get 429 even with the correct PIN. Reproduced: Sai with the right PIN was blocked after 59 wrong tries by other students. |
| N-2 | Medium | ✅ `trust proxy: true` lets a client send a fake `X-Forwarded-For` and bypass every IP limit (30 wrong teacher logins all got 401, never 429). Safe on Vercel (it overwrites the header) but not elsewhere. Use `trust proxy: 1`. |
| N-3 | Medium | ✅ Add students: Save is silently disabled if ANY line is invalid, with no message near the button, all-or-nothing. |
| N-4 | Low | ✅ Paste parser accepts junk as a name (a long sentence became a student called "a"). |
| N-5 | Low | ✅ Rate-limit message says "on this phone" but the limit is per network; "10 minutes" is really 0-10 (fixed window). |
| N-6 | Low | ✅ In dev, every share link (setup, teacher invite, reset, class) uses `localhost:4000` (the API) instead of the web port 5173; PUBLIC_APP_URL unset. |
| N-7 | Low | ✅ `/admin` table is clipped at desktop width (760px max) so the Actions column needs sideways scrolling. |
| N-8 | Low | ✅ New teacher home mentions "Words" but there is no navigation until a class exists. |
| N-9 | Low | ✅ School admin sees "Remove admin / Turn off" on the only admin; it only fails (409) after the click. |
| N-10 | Low | 📖 After a class code is rotated, remembered phone profiles still hold the old code for their re-login path. |
| N-11 | Low | ✅ The deployed production site needs SUPER_ADMIN_SECRET and PUBLIC_APP_URL in Vercel, otherwise `/admin` is off and nobody can create a school. |

## Old bugs still present here
♻ B-01 ✅ finished session still accepts attempts (late attempt 200; totalMarks 200 vs word scores 180).
♻ B-04 ✅ one word "Warm." earns 24/40; starter-only earns marks; repeated-word spam scores (cap reached in test).
♻ B-02, B-05, B-06, B-12, B-13, B-15, B-16, B-17 (code unchanged; not re-run live). B-07 (no request timeout in the rewritten api.ts) and B-08 (outbox keeps non-API errors forever) 📖 still present. B-10 (teacher Words duplicate error off-screen) and B-14 (names truncated; new `PickName` tiles) need a live re-check. B-03 and B-09 are superseded by their rate limits and invites. B-18 present (Node 26 tests, db creation).
All of these are fixed on `master` (commit 0de59c9) except N-1..N-11.
