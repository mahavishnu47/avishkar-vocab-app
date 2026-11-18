# UI Spec (MVP)

React 19 + Vite PWA, TypeScript, plain CSS with the tokens in `apps/web/src/theme.css` (no CSS framework). Target devices are **low-end Android home phones** (2 GB RAM, Chrome, 320-430 px wide, patchy 3G). Teachers use a phone or a laptop.

## 1. Folder ownership (parallel agents never touch the same file)

| Path | Owner | Notes |
|---|---|---|
| `apps/web/src/main.tsx`, `App.tsx`, `theme.css`, `shared/api.ts`, `vite.config.ts`, `index.html` | **Architect / Wave 2 integration** | Frozen in Wave 1. Need a token or an API change? Write it in your task report; don't edit. |
| `apps/web/src/student/**` | **Lane C (student UI)** | `StudentApp.tsx` is the entry. Own nested routes. |
| `apps/web/src/shared/OnScreenKeyboard.tsx`, `shared/OnScreenKeyboard.css`, `shared/speech.ts`, `shared/outbox.ts`, `shared/session-store.ts` | **Lane C (student UI)** | The keyboard props are frozen (section 5). |
| `apps/web/src/teacher/**` | **Lane D (teacher UI)** | `TeacherApp.tsx` (default export, lazy-loaded) is the entry. Put teacher-only components here and don't import from `student/`. |
| `server/src/**`, `server/test/**` | Lane A (server) | |
| `packages/core/src/**`, `packages/core/test/**` | Lane B (core logic) | Except `types.ts`, `api.ts`, `taxonomy.ts`, `scoring.config.ts` (contract, frozen) |
| `content/**` | Content lanes (one file each) | |

Both UI lanes import types and logic only from `@shabd/core` and call the server only through `shared/api.ts` (`api.*`).

## 2. Global UX rules (PRD section 12)

- One screen, one task, one big button. Primary buttons use the `.btn .btn-primary .btn-block` classes and are at least 56 px tall. Gaps between targets are at least 8 px. Layout is single-column; never scroll horizontally at 320 px.
- Icons and audio come before text. Instructions are at most 6 words and simple (Std 3 reading level). The mascot is Mitra the parrot 🦜.
- Kind feedback only: wrong answers get the `.wobble` animation and "Almost! Try again 💪" (`--c-warn`, never red). Correct answers get `.pop` and a varied phrase ("Super!", "Well done!", "You got it!"). Respect `prefers-reduced-motion` (handled in `theme.css`).
- Stage colours are always the same: 🔵 Listen = `--c-listen`, 🟢 Learn = `--c-learn`, 🟣 Write = `--c-write`. A **progress caterpillar** at the top of `/play` has 5 segments (words) × 3 dots (stages).
- No timers are shown anywhere. Time is logged silently (`msElapsed`).
- **No native text inputs in the student flow** except the login class-code field (section 3.1). Spelling and sentence writing both use `<OnScreenKeyboard>`.
- Every icon button has an `aria-label`. Contrast meets WCAG AA (the tokens are pre-checked).
- Network state: a small chip in the top bar shows "☁️ saved" or "⏳ waiting to save (n)" from `outbox.onStatusChange`.
- Bundle: the student path must stay under 150 KB gzipped JS. The teacher UI is code-split (already wired in `App.tsx`). No chart or UI libraries; draw bars with plain SVG or divs.

## 3. Student screens (routes under `/`)

The student token lives in `localStorage` (`shared/api.ts#setToken`). Any 401 clears it and redirects to `/login`.

### 3.1 `/login`: class code, then name, then PIN
1. **Class code:** one big text field (`autocapitalize="characters"`, `autocomplete="off"`, 6 characters) plus "Next". The last used code is remembered in `localStorage` (`shabd.classCode`) and the step is skipped next time, with a "Change class" link.
2. **Who are you?** A grid of avatar and first-name buttons from `api.publicRoster(code)` (2 columns, 64 px tall).
3. **PIN:** 4 dots plus a big numeric keypad (3 × 4 grid: 1-9, ⌫, 0, ✔). It submits automatically on the 4th digit. A wrong PIN wobbles and says "Try again". A 423 response shows "Too many tries. Wait 5 minutes 🙂".
4. Success goes to `/`. A "Teacher? Log in here" link sits small at the bottom of step 1 only.

### 3.2 `/`: Home
- Top bar: avatar, first name, ☁️ chip, and a 🏆 button (→ `/leaderboard`, hidden when `leaderboardMode === 'hidden'`).
- A large card: **🔥 streak** ("3 days!") and **⭐ XP** (total, with a level bar from `level.xpIntoLevel / level.xpForNextLevel`).
- Today: 5 dots filled for `wordsDone`.
- The big **Play ▶** button says "Start today's words" (or "Continue" when `in_progress`). The status `completed` shows "All done today! 🎉 Come back tomorrow" plus a "See my score" button that opens the stored summary.
- A "Not you? Switch" link logs out.
- Hearing the first word takes 2 taps or fewer from Home: Play → (Stage 1 auto-plays the word after the tap).

### 3.3 `/play`: session runner
`POST /student/sessions/today` returns `{session, words, progress}`. The client state machine runs, for each word i in 0..4 that is not in `progress.completedWordIds`: `spell → learn → check → write → wordDone`, and then `summary`. The full in-stage state is saved after every step to `localStorage` under `shabd.session.<sessionId>` (`shared/session-store.ts`), so closing the app resumes at the exact stage. Every attempt is sent through the outbox (`enqueue({kind:'attempts'…})`) **as it happens**. The UI never waits for the network except Stage 3 (below).

**Stage 1: Listen & Spell (🔵)**
- 🔊 "Hear the word" (rate 0.9) and 🐢 "Slowly" (rate 0.6) buttons, both 64 px and free to use. The word auto-plays once on entering the stage. The play count goes into `audioPlays`.
- `<KeyboardDisplay mode="spelling">` above `<OnScreenKeyboard mode="spelling" onSubmit=check>`.
- Hints (once each, the cost shown on the button): 💡 "First letter −6" pre-fills or shows the first letter; 🧩 "Letter tiles −14" sets `restrictToLetters` = the word's letters, shuffled.
- Check runs `classifySpellingError` locally for instant feedback (the server re-classifies).
  - Wrong #1: "Almost! Listen again 🔊" and reveal the letter boxes (`slots = word.length`).
  - Wrong #2: green letters plus ✓ underline where correct (`correctPositions`).
  - Wrong #3: show the answer, then "Type it once" (copy mode, unscored, needs an exact match to continue).
  - Correct: celebrate, then continue.
- Typing is lowercase only and case-insensitive.

**Stage 2a: Learn (🟢)**
- Shows the word (`.word-display`), POS chip, `syllables` with dots (whis·per), the meaning, and the example sentence with the word **highlighted**.
- "मराठी" toggle (remembered in `localStorage: shabd.showMarathi`) shows `meaningMarathi` (with `lang="mr"`).
- 🔊 reads the word, then the meaning, then the example.
- "Next" is enabled after 3 seconds (stops tap-through).

**Stage 2b: Check (🟢)**
- "What does **whisper** mean?" with 3 big option buttons: `meaning` plus the 2 `distractorMeanings`, shuffled with a seed of `sessionId + wordId` so the order is stable across resume.
- Up to 2 taps. A wrong tap greys out that option and says "Try again". After 2 wrong taps, highlight the right answer with "It means: …".
- Each tap is a `MeaningAttemptInput`.

**Stage 3: Write your sentence (🟣)**
- The word chip with 🔊, the prompt "Write a sentence with **whisper**", `<KeyboardDisplay mode="sentence">`, and `<OnScreenKeyboard mode="sentence" onSubmit=submit submitLabel="Check ✔">`.
- 💬 "Help me start −5" inserts a starter chosen by POS: noun "I saw a {w}", verb "Every day I {w}", adjective "The {w}", adverb "She walked {w}", other "I {w}". It sets `starterHintUsed`.
- On submit:
  1. Run `evaluateSentenceRules` locally and show the checklist immediately (✅ or ⚠️ per `feedback` item).
  2. Call `api.postSentence` (spinner, at most 7 seconds). Use the server's evaluation when it arrives, including a `tip` (💡 line). On a network error, keep the local result and enqueue the request.
  3. If gate ≠ `ok`, show a friendly message (`word_missing`: "Use the word **whisper** in your sentence 🙂"; `devanagari`: "Please write in English letters 🙂"; `blocked`: "Let's write a kind sentence 🙂"; `empty`). The submission is not used up.
  4. After a counted submission 1, offer "Try again (better score)" or "Next word ▶". After submission 2, only "Next".
- Then `enqueue({kind:'completeWord'})` and go to the next word.

### 3.4 `/summary`
- Reached after word 5: `enqueue completeSession`, then try `api.completeSession` directly (wait at most 5 seconds).
- Shows per-word stars (★★★ from `starsFor`), total marks out of 500, an XP breakdown (word marks, completion bonus, streak bonus, perfect-word bonus), and the streak flame with a "+1" animation.
- Offline fallback: compute the same summary locally with core (`scoreWord`, `computeXp`, `updateStreak`) and label it "will sync".
- Button "Home".

### 3.5 `/leaderboard`
- "This week" (resets Monday): the top 10 rows (rank, avatar, first name, XP), plus the student's own row pinned at the bottom if they are outside the top 10. The student's own row is highlighted.
- An encouraging footer: "Every day you play gives bonus XP!"
- Hidden mode: the route redirects to Home.

## 4. Teacher screens (routes under `/teacher`, `.teacher` class: dense, table-friendly)

| Route | Screen | API |
|---|---|---|
| `/teacher/login` | Email and password login, with a "Create account" toggle (name, email, password, invite code). | `teacherLogin`, `teacherRegister` |
| `/teacher` | **My classes:** a list (name, code, start date) and "New class" (name, start date). One class → go straight to its dashboard. | `listClasses`, `createClass` |
| `/teacher/classes/:id/roster` | **Roster:** a table (roll, name, avatar, PIN, active toggle, Reset PIN). "Add students": a textarea with one `roll, name` per line, a preview, then Save. | `roster`, `addStudents`, `updateStudent`, `resetPin` |
| `/teacher/classes/:id/cards` | **Login cards** (print stylesheet): 8 cards per A4, each with the app URL, class code, avatar, first name and PIN in large digits. Has a Print button. | `roster` |
| `/teacher/classes/:id/words` | **Today's words editor:** a date picker (default today, ‹ › to step days) and 5 slots showing word, POS, difficulty and meaning (source badge: Auto / Edited). Per slot: "Change" opens the **word picker** (search box plus difficulty/POS/tag filters, results list, "Use this") or a "+ Custom word" form (fields of `CreateWordReq`). Then "Save day" (PUT) and "Reset to auto" (DELETE). Warns if a word was already used in the last 30 days (check `dashboard` / `dailyWords` for previous dates; a client-side check is fine). | `dailyWords`, `searchWords`, `createWord`, `setDailyWords`, `resetDailyWords` |
| `/teacher/classes/:id/dashboard` | **Today:** a date picker, the day's 5 words, "x/y completed", and a student table (roll, avatar, name, status ✅ ◐ ✗, words done, marks /500, streak, XP this week) that can be sorted by any column. Clicking a row opens the student detail. | `dashboard` |
| `/teacher/classes/:id/leaderboard` | Week / All-time tabs, the full ranking, and a **Show leaderboard to students** toggle (individual / hidden). | `classLeaderboard`, `updateClass` |
| `/teacher/classes/:id/analytics` | **Class weakness view:** a heatmap table (students × top spelling codes and sentence codes; cell = rate, coloured in 4 steps; **sortable**), Spelling Strength and Sentence Strength columns, a weakness label column, "Hardest words" list, a date-range picker, and **Export CSV** buttons (attempts, sentences, daily, students). | `classAnalytics`, `exportCsvPath` |
| `/teacher/students/:id` | **Student detail:** a header (name, PIN, streak, XP), 2 strength bars, top spelling errors (bar list with `ERROR_LABELS` + example "whisper → wisper"), sentence rubric averages (4 bars: use /10, grammar /10, relevance /12, length /8), weakness labels with a suggested activity (static text per code, kept in `teacher/remedies.ts`), and tables for recent sessions, spelling errors and sentences (text, rubric, marks, evaluator, tip). | `studentDetail` |

- **CSV download:** `fetch(api.exportCsvPath(...), {headers: {Authorization}})` → blob → `<a download>` (a plain link cannot send the bearer token).
- A teacher nav bar shows: class switcher · Today · Words · Roster · Leaderboard · Analytics · Cards · Log out.
- At widths under 768 px, tables scroll horizontally inside a wrapper (`overflow-x:auto`); the page itself never scrolls sideways.

## 5. `<OnScreenKeyboard>` component contract

File: `apps/web/src/shared/OnScreenKeyboard.tsx` (stub with the final props is committed; Lane C implements it). Styles go in `shared/OnScreenKeyboard.css` and are imported by the component.

```ts
type KeyboardMode = 'spelling' | 'sentence';
interface OnScreenKeyboardProps {
  mode: KeyboardMode;
  value: string;                       // controlled
  onChange: (next: string) => void;    // full next value after each key
  onSubmit?: () => void;               // shows the big submit key
  submitLabel?: string;                // default 'Check ✔' / 'Submit ✔'
  submitDisabled?: boolean;
  maxLength?: number;                  // default 20 spelling / 160 sentence
  restrictToLetters?: string[];        // letter-tiles hint: only these keys (each usable once)
  autoCapitalize?: boolean;            // sentence mode, default true
  disabled?: boolean;
  haptics?: boolean;                   // navigator.vibrate(10), default true
  className?: string;
}
interface KeyboardDisplayProps { value: string; slots?: number; correctMask?: boolean[]; placeholder?: string; showCaret?: boolean; mode: KeyboardMode }
```

**Layout**
- Rows: `q w e r t y u i o p` / `a s d f g h j k l` / `⇧ z x c v b n m ⌫` (⇧ appears in sentence mode only).
- Bottom row in spelling mode: `[ Check ✔ ]` at full width.
- Bottom row in sentence mode: `, . ? ! ' [ space (wide) ] [ Submit ✔ ]`.
- Fixed to the bottom of the viewport, full width, padded for `env(safe-area-inset-bottom)`. Key height is `var(--kb-key-h)`, gap `var(--kb-gap)`. The screen above uses `.screen.with-keyboard` so content is never covered.
- Letter keys show lowercase. In sentence mode they show uppercase while Shift is on.

**Behaviour**
- Keys respond to `onPointerDown` with `preventDefault()`, so the keyboard is fast and never moves focus. On press, the key gets a visual pressed state (`--kb-key-press`) for 80 ms.
- Long-pressing ⌫ repeats every 80 ms after a 400 ms delay.
- Shift is one-shot: it applies to the next letter, then turns off. With `autoCapitalize`, Shift turns on automatically when the value is empty or ends with `. `, `! ` or `? `.
- In spelling mode, only a-z and backspace work. Values are always lowercase.
- In sentence mode:
  - Space never doubles: a second space is ignored, and space is ignored at the start.
  - Punctuation directly after a space replaces that space (so "word ." becomes "word.").
- Once `maxLength` is reached, further characters are ignored and the keyboard wobbles.
- `restrictToLetters`: render only those letters as tiles (in the given order) plus ⌫. A used tile is disabled. Deleting a letter re-enables the first disabled tile with that letter.
- The physical keyboard also works when the component is mounted on desktop (a `keydown` listener on `window`): letters, Backspace, Enter (submit), space and punctuation. This helps teachers and QA.
- Accessibility: each key is a `<button>` with `aria-label` (e.g. "letter a", "backspace", "space", "shift"). The container has `role="group" aria-label="keyboard"`.
- No native `<input>` or `<textarea>` is ever focused in the student flow, so the phone keyboard never appears and there is no autocorrect.

## 6. Speech (`shared/speech.ts`)

`speak(text, {rate})` uses `speechSynthesis` with the voice order **en-IN → en-GB → any en → default**. It waits up to 1.5 s for `voiceschanged`. It calls `cancel()` before speaking. If speech is unsupported, `speechSupported()` returns false and Stage 1 shows the word's **syllables masked** ("_ _ _ _ _ _ _", 7 letters) with a note "🔇 Sound is off on this phone. Ask someone to read the word." The attempt is still allowed.
