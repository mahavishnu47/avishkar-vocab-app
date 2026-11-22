# Build Plan: WordWise MVP (local, about 2 days)

**Read first:** `docs/PRD.md` sections 5-13 (product), `docs/API.md`, `docs/UI_SPEC.md`, `docs/CONTENT_SPEC.md`, and `packages/core/src/{types,api,taxonomy,scoring.config}.ts` (the contract).
**MVP simplifications vs the PRD:**
- Backend: Express + SQLite instead of Supabase.
- Students log in with class code + name + 4-digit PIN; there is no consent gate (the school handles consent).
- Words: 5 per day, auto-picked by class `startDate` day index, and the teacher can override any day.
- Audio: browser SpeechSynthesis en-IN only.
- Offline: a localStorage outbox.
- Sentence scoring: rules, plus optional Claude scoring when `ANTHROPIC_API_KEY` is set.
- Cut: review warm-up, shields, chests, garden, catch-up mode, push notifications, teacher review queue, research pseudonymisation, and the school calendar. Streaks count calendar days.

## Ground rules for every agent

1. **Stay in your lane.** Edit only the paths your task owns (the table below and `UI_SPEC.md` section 1). Contract files are frozen: `packages/core/src/{types,api,taxonomy,scoring.config}.ts`, `apps/web/src/{App.tsx,main.tsx,theme.css,shared/api.ts}`, `docs/*.md`, root configs. If the contract is wrong, work around it locally and list the needed change under **"Contract change requests"** in your final report.
2. **No new npm dependencies** in Wave 1. Everything needed is installed: express 5, better-sqlite3, @anthropic-ai/sdk, react 19, react-router 7, vite 7, vitest 3, supertest, jsdom, @testing-library/react. Do not run `npm install <pkg>`.
3. **Git:** the work happens in one shared working tree on `master`, with no push. Commit only your own paths: `git add <your paths> && git commit -m "<task-id>: <summary>"`. **Never** use `git add -A`, `git stash`, `git reset`, `git checkout -- .`, or rebase. If `index.lock` exists, wait a few seconds and retry.
4. **Done means:** your acceptance checks pass, `npm run typecheck` shows no errors **in your paths**, and your tests pass.
5. Use the logic in `@shabd/core`; never reimplement scoring, classification or evaluation in the UI or server.
6. Keep it lean. The pilot has 200 students on cheap phones; working and simple beats clever.

## Wave 1 (fully parallel: 10 agents)

| ID | Task | Owns (exclusive) | Size |
|---|---|---|---|
| C1-C6 | Content part 1-6 | `content/words/part-0N.json` | M each |
| B1 | Core logic + tests | `packages/core/src/{scoring,spelling,sentence,moderation,gamification,dates}.ts`, `packages/core/src/data/**`, `packages/core/test/**` | L |
| A1 | Server: DB, auth, roster, words, sessions, analytics, export | `server/src/**` (except `services/claudeEvaluator.ts`), `server/test/**` | L |
| UI-S | Student UI + keyboard + speech + outbox | `apps/web/src/student/**`, `apps/web/src/shared/{OnScreenKeyboard.tsx,OnScreenKeyboard.css,speech.ts,outbox.ts,session-store.ts}` | L |
| UI-T | Teacher UI | `apps/web/src/teacher/**` | L |

### C1-C6: Content parts (one agent per part)
Write `content/words/part-0N.json` following `docs/CONTENT_SPEC.md`.
- Days and difficulty mix: CONTENT_SPEC section 1.
- Choose words using the hash-ownership workflow: section 3, with `node scripts/word-owner.mjs --part N --file <candidates>`.
- Write in batches of about 10 days and validate after each batch.

**Acceptance criteria**
- `node scripts/validate-words.mjs --part N` prints `OK` (305 words, days complete, mix exact, every word owned by part N).
- Self-review of 20 random entries:
  - The meaning is simple and correct.
  - The Marathi gloss is natural.
  - The example sentence shows the meaning and fits an Indian child's world.
  - The distractors are clearly wrong but plausible.
  - No unsuitable words (CONTENT_SPEC section 5 "Avoid").
- Commit: `C<N>: content part N`.

### B1: Core logic (`packages/core`)
Implement every stubbed function, exactly as its doc comment and the PRD sections listed below specify.
- `scoring.ts`: PRD 7.2-7.4, with constants from `scoring.config.ts`.
- `gamification.ts`: `updateStreak`, `displayStreak`, `computeXp`, `levelFor`.
- `dates.ts`: IST via `Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'})`.
- `spelling.ts`: PRD 9.1 classifier.
  - Damerau-Levenshtein (OSA) with an op trace.
  - Rule checks:
    - silent letters (wh, kn, wr, -mb, -gh, final -e, gn, ps)
    - doubled or undoubled consonants
    - vowel-only differences
    - L1 swaps (v↔w, s↔sh, z↔j, ph↔f, dropped schwa)
    - a phonetic-equivalence key (a simplified Metaphone)
    - transposition, omission, insertion, substitution
    - far miss (> 50% of the target length)
    - a small homophone list (≥ 40 pairs) and a common-word list (about 3k words, in `src/data/common-words.ts`) for real-word and homophone detection
  - Priority comes from `SPELLING_PRIMARY_PRIORITY`.
- `sentence.ts`: PRD 8.2 rule table (R1-R4) with the gate order in the doc comment.
  - Lexicon for the real-word ratio: reuse `data/common-words.ts`, plus a ~300-word verb list.
  - Copy detection: Jaccard ≥ 0.6 against `exampleSentence` → R3 = R4 = 0 and `SN_COPIED`.
  - Repeated token (≥ 3 times) → grammar −2.
  - Child-friendly `feedback` messages (≤ 8 words each).
  - `confidence < 0.6` when R3 came from the benefit-of-the-doubt branch.
- `moderation.ts`: a small blocklist (English + transliterated Marathi/Hindi), PII regexes (10-digit numbers, emails), safeguarding phrases.

**Acceptance criteria (vitest, `npm test -w @shabd/core`)**
- **Scoring:**
  - PRD 7.6 Example A spelling 40, meaning 20, sentence 36 → total 96, 3★.
  - Example B: 24 / 8 / 28 → 60, 2★.
  - Example C: spelling 0; sentence best(20, round(40 × 0.8) = 32) = 32; total 52, 1★.
  - Example E: 18.
  - Hints never go below 0. Duplicate hints count once.
- **XP:**
  - Totals [96, 60, 72, 85, 52], completed, streakAfter 4 → 410 (365 + 25 + 20). A streak of 12 gives a bonus of 50 (the cap).
  - Catch-up halves the word marks and gives no bonuses.
  - Perfect bonus is +5 per 100.
  - `levelFor`: 499 → level 0, 500 → level 1, 1500 → level 2, 2710 → level 2 with into = 1210 and span = 1500.
- **Streak:** same day → unchanged; consecutive days → +1; a gap → 1; `best` is tracked; `displayStreak` returns 0 after a missed day.
- **Dates:** `dayIndexFor` boundaries are 1, 366, wrap to 1, and −1 → 366. `weekStart` returns Monday. IST midnight edge: 2026-11-19T18:31Z → 2026-11-20.
- **Spelling classifier:** a fixture `test/fixtures/spelling.json` of **≥ 80 labelled pairs** (all PRD 9.1 examples plus your own covering every code). **≥ 85% primary-tag agreement**, every PRD example exact, and each call < 2 ms on average (1000-call loop).
- **Sentence evaluator:**
  - Fixture `test/fixtures/sentences.json` with ≥ 40 cases, including the PRD 7.6 A/B/C sentences: A → rubric 10/10/12/4. B ("elephant is enormous") → 10/6/12/0. C submission 1 → copied (R3 = R4 = 0).
  - Gates: empty, Devanagari, missing word (`word_missing`), blocked.
  - Misspelt target → use = 5 with `SN_WORD_MISSPELT`.
  - Each evaluation takes < 20 ms.
- Coverage of `src/` (excluding `data/`) ≥ 90% lines (`vitest run --coverage` is optional; just state the number if you measure it).
- Commit: `B1: core scoring, classifier, sentence rules`.

### A1: Server (`server/`)
Implement every endpoint in `docs/API.md` using the stubs in `server/src/routes/*` and `services/*`.
- `db/seed.ts`:
  - `loadWordBank`: reads `content/words/part-*.json`, skips `_*` files, upserts, and tolerates missing or invalid files with a warning. If the bank is still empty afterwards, it loads `server/test/fixtures/mini-bank.json` instead. You write that fixture: **10 days × 5 words** (days 1-10), valid per CONTENT_SPEC except for hash ownership, so dev and tests work before content exists.
  - `seedDemo`: as documented in the stub.
- `auth.ts`:
  - `node:crypto` scrypt for passwords.
  - Tokens are stored in a table.
  - `attachAuth` / `requireTeacher` / `requireStudent` return a 401 JSON body.
  - PIN lockout.
- Scoring and evaluation always go through `@shabd/core` (`scoreWord`, `classifySpellingError`, `computeXp`, `updateStreak`, `dayIndexFor`, `todayIST`, …) and `services/sentenceEvaluator.ts`. In Wave 1, `sentenceEvaluator` is **rules only**; call `claudeEnabled()` / `evaluateWithClaude` behind try/catch exactly as its doc comment describes, so Wave 2 only has to fill in `claudeEvaluator.ts`.
- **Allow overriding "today" for tests and demos:** if `process.env.FAKE_TODAY` (`YYYY-MM-DD`) is set, use it instead of `todayIST()`.
- Tests (`server/test/*.test.ts`, vitest + supertest against `createApp()` with `setDb(openDb(':memory:'))`):
  - auth (register, login, wrong PIN, lockout, 401s, a teacher cannot read another teacher's class)
  - roster paste-add (409 on a duplicate roll)
  - daily words (auto set, then override, then reset)
  - full student flow (today → attempts → sentences ×2 → complete words → complete session → home, leaderboard, dashboard, analytics, student detail)
  - CSV (BOM, header row, quoting)
  - idempotency (re-post the same clientIds, complete twice → the same XP)
- Tests that need B1's core functions will throw `not implemented` until B1 lands. Write them anyway. They must pass by the end of Wave 1 or in W2-1.

**Acceptance criteria**
- `npm test -w @shabd/server` is green (once B1 has landed).
- `npm run dev` boots with the demo class seeded, and `curl` against the API.md examples returns the documented shapes.
- Weakness labels follow the rule in `services/analytics.ts`.
- Commit: `A1: server API`.

### UI-S: Student UI
Implement UI_SPEC sections 3, 5 and 6 under the paths you own.
- Session state machine and resume (`shared/session-store.ts`).
- Outbox with retry (`shared/outbox.ts`).
- `OnScreenKeyboard` + `KeyboardDisplay` (props frozen).
- `speech.ts`.
- Screens: `/login`, `/`, `/play` (stages 1, 2a, 2b, 3), `/summary`, `/leaderboard`.
- Call `startOutbox()` once from `StudentApp`.

Develop against the real server (A1 in parallel). Until it responds, build against a local mock module `student/dev-mock.ts`, enabled by `?mock=1`, that returns typed fixtures.

**Acceptance criteria**
- At 320 × 640 and 412 × 915 (Chrome device emulation), with no horizontal scroll, the full flow works with the demo class:
  - login (code DEMO5A, Riya, PIN 1234)
  - play all 5 words through every stage
  - summary
  - leaderboard
- **The native keyboard never opens** in the spelling or sentence stages (no focusable input there).
- Reloading in the middle of any stage resumes the same word and stage.
- With DevTools offline, attempts queue (⏳ chip), and going back online flushes them (☁️), with no duplicates on the server.
- Unit tests (vitest + jsdom) for the keyboard reducer logic (shift, space, punctuation, restrictToLetters, maxLength) and the outbox (FIFO, drop on 4xx, keep on network error).
- Student JS ≤ 150 KB gzipped (`npm run build`, check the size output).
- Commit: `UI-S: student app`.

### UI-T: Teacher UI
Implement UI_SPEC section 4 under `apps/web/src/teacher/**`:
- login and register
- classes
- roster with paste-add and reset PIN
- print login cards (8 per A4, print CSS)
- words editor (picker plus custom word form)
- dashboard
- leaderboard with the mode toggle
- class analytics heatmap with sortable columns and CSV export buttons
- student detail with `remedies.ts`

Use the `.teacher` theme. Use plain SVG or div bars (no chart library). A mock mode is allowed as in UI-S (`teacher/dev-mock.ts`).

**Acceptance criteria**
- With the seeded demo teacher (demo@school.test / demo1234), every screen loads at 375 px and 1280 px wide.
- Paste-adding 3 students shows them with PINs.
- Login cards print-preview as 8 per page.
- Overriding today's words is visible to a student who has not started yet.
- CSV downloads open in Excel or LibreOffice with Marathi text intact.
- Analytics sorts by any column.
- A student with ≥ 10 silent-letter errors at ≥ 1.5× the class rate shows "Needs support: Silent letters" (use the A1 test data or play a few sessions).
- The teacher code is not in the student bundle (check `dist/assets`: the teacher chunk is separate).
- Commit: `UI-T: teacher app`.

## Wave 2 (after Wave 1 lands)

| ID | Task | Owns |
|---|---|---|
| W2-1 | Integration and end-to-end hardening | anything needed to wire things together (contract files may change here, and only here) |
| W2-2 | Claude sentence evaluator | `server/src/services/claudeEvaluator.ts`, `server/test/claude*.test.ts` |
| W2-3 | QA pass, content QA and fixes | bug-fix commits in any lane; `docs/QA_REPORT.md` |

### W2-1: Integration
- Merge the lanes' "Contract change requests" into the contract files.
- Make the full validator pass: `node scripts/validate-words.mjs` OK with 1830 words (fix stragglers).
- Ensure the server loads all 1830 words. Remove or keep the mini-bank fallback, but load it only when the bank is empty.
- Make `npm run typecheck`, `npm test` and `npm run build` all pass.
- Write `scripts/smoke.mjs`: it starts nothing; it hits a running server, registers a teacher, creates a class, adds 2 students, logs in as a student and plays a whole session through the API, then asserts the dashboard and analytics.
- Add a phone test path to the README: `npm run dev` already binds `host: true`, so phones on the same Wi-Fi open `http://<laptop-ip>:5173`.
- **Acceptance:** a fresh clone runs `npm install && npm run dev` and works with zero config, and the smoke script passes.

### W2-2: Claude sentence evaluator
Implement `evaluateWithClaude` per its doc comment.
- **First load the `claude-api` skill** (or read the official `@anthropic-ai/sdk` TypeScript docs) and use current API shapes:
  - model `process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5'`
  - structured JSON output via `output_config.format` with a JSON schema: `{use, grammar, relevance, length, errorCodes[], tip}`
  - `output_config.effort: 'low'`
  - `max_tokens` about 1000
  - `maxRetries: 0`, with an `AbortSignal` timeout of 6 s
  - handle `stop_reason === 'refusal'` by falling back to the rules result
- The system prompt contains the rubric (PRD 8.2 R2-R4 definitions and maxima), the child's context (Std 5, Marathi L2 learner, be generous on meaning, strict on the target-word use that rules already decided), and tip style (≤ 15 words, kind, concrete, no mention of AI or scores).
- The user message contains only the word, POS, meaning and sentence. **No student identifiers.**
- Clamp every dimension. Keep R1 and copy detection from the rules result. Store `rules_json` (the rules result) next to the Claude one for research comparison.
- **Acceptance criteria**
  - Unit tests mock the SDK client (no network): a valid JSON response is mapped and clamped; a timeout, refusal or malformed JSON returns the rules result; an unset key returns rules.
  - One optional live test is gated by `RUN_LIVE_CLAUDE=1`.
  - The README documents setting the key and the model, and notes cost and privacy: only sentence text is sent.

### W2-3: QA
- **Device matrix:** a real low-end Android (or Chrome emulation with a CPU 4× slowdown, Slow 3G) at 320 px and 412 px.
- **Checklist:**
  - UI_SPEC section 2 rules
  - every acceptance criterion above
  - keyboard edge cases
  - speech on an Android phone with no en-IN voice
  - offline: queue, reload, sync
  - two students on the same phone (switch user)
  - midnight rollover (`FAKE_TODAY`)
  - teacher override after a student has started (keeps the snapshot)
- **Content QA:** sample 60 random entries (10 per part) for accuracy, Marathi gloss, distractors and appropriateness. Fix the bad ones in place, keeping the validator green.
- Accessibility: a Lighthouse a11y score ≥ 90 on student screens.
- Write `docs/QA_REPORT.md` (pass/fail table plus fixed and known issues). Fix P0 and P1 bugs directly with small commits (`QA: …`).

## Critical path and timing (about 2 days)
- **Day 1:** Wave 1, all in parallel. C1-C6 run for about 3-5 hours each. B1, A1, UI-S and UI-T take most of the day. A1 and the UI lanes integrate against each other as soon as the endpoints respond.
- **Day 2 morning:** W2-1 integration and W2-2 Claude (in parallel).
- **Day 2 afternoon:** W2-3 QA and fixes, then a dry run with the demo class on 2-3 phones.
