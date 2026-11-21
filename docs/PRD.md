# Product Requirements Document: "Shabd Mitra" Daily Vocabulary App (MVP)

| Field | Value |
|---|---|
| Working name | **Shabd Mitra** ("Word Friend"); placeholder, the team can rename it |
| Context | Avishkar Inter-University Research Convention (Mumbai), B.Ed research team |
| MVP audience | Maharashtra State Board, Standard 5 (ages 10-11) |
| Document status | v1.0, ready for build planning |
| Date | 18 Nov 2026 |
| Owner | Product planning (B.Ed research team) |

---

## Table of Contents

1. [Vision, Problem and Research Angle](#1-vision-problem-and-research-angle)
2. [Target Users and Personas](#2-target-users-and-personas)
3. [Goals and Non-Goals (MVP)](#3-goals-and-non-goals-mvp)
4. [Hooked Model Mapping and Ethical Guardrails](#4-hooked-model-mapping-and-ethical-guardrails)
5. [User Stories and Acceptance Criteria](#5-user-stories-and-acceptance-criteria)
6. [Functional Requirements: Feature Increments F1-F22](#6-functional-requirements-feature-increments-f1-f22)
7. [Scoring System](#7-scoring-system)
8. [Sentence Evaluation Approach](#8-sentence-evaluation-approach)
9. [Error Taxonomy](#9-error-taxonomy)
10. [Data Model](#10-data-model)
11. [Tech Stack and Architecture](#11-tech-stack-and-architecture)
12. [UX Principles for 10-Year-Olds](#12-ux-principles-for-10-year-olds)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Success Metrics](#14-success-metrics)
15. [Risks and Mitigations](#15-risks-and-mitigations)
16. [Open Questions (Decision-Blocking)](#16-open-questions-decision-blocking)
17. [Phased Roadmap and Task Breakdown](#17-phased-roadmap-and-task-breakdown)
18. [Appendix A: Seed Word List Sample](#appendix-a-seed-word-list-sample)
19. [Appendix B: Critical Review of the Original Brief](#appendix-b-critical-review-of-the-original-brief)

---

## 1. Vision, Problem and Research Angle

### 1.1 Vision

Every Standard 5 child in Maharashtra learns **five useful English words a day**, and can **hear, spell, understand and use** each one in their own sentence. Ten to fifteen focused minutes a day should feel like a game, not homework, and should never become a compulsion.

### 1.2 Problem statement

Teachers report that students struggle to **recall words** and **say what they mean**. That is a problem of both *receptive* vocabulary (recognising a word) and *productive* vocabulary (using it). In Maharashtra State Board schools, English is often the second or third language. Exposure outside the classroom is low. Learning happens mostly through rote copying of meanings, and students rarely get a chance to:

- hear a word said correctly and **encode its spelling from sound**;
- meet the meaning in a child-friendly form, with a bridge from their mother tongue (Marathi or Hindi);
- **produce** the word in a new context, which is the step most predictive of long-term retention.

Existing apps (Duolingo and similar) are not aligned with the State Board syllabus. They are not designed for shared or low-end devices. They give teachers no class-level view of *which kind* of error each child makes.

### 1.3 Solution in one line

A simple, offline-tolerant, gamified web app (PWA). Each school day it serves 5 teacher-approved words through a 3-stage loop: **Listen & Spell → Learn & Check → Write Your Sentence**. Teachers get a weakness view that separates spelling problems from sentence-building problems.

### 1.4 Research angle (Avishkar)

The app is the intervention, and the research claim is what gets judged. The product must therefore be **instrumented for research from day one**: every attempt is logged with timestamps, an error category and the hints used.

**Research question.** Does a daily, gamified, production-oriented vocabulary routine (spell-from-audio, meaning check, own-sentence writing) improve Standard 5 students' spelling accuracy, word-meaning knowledge and productive word use more than regular classroom instruction, and are those gains retained after 7 and 14 days?

**Recommended design: quasi-experimental, pre-test/post-test, with two layers of control.**

| Element | Recommendation |
|---|---|
| Groups | **Treatment**: one or more Standard 5 divisions using the app for 4 weeks (20 school days, 100 words). **Control**: a comparable division in the same school taught the same 100 words through the usual method (teacher reads, students copy the meaning). |
| Within-subject control | The test battery includes **20 untaught "control words"** of matched difficulty. Gains on taught words compared with control words separate learning from general maturation and test familiarity. This works even if no control division is available. |
| Pre-test (Day 0) | 40 items: 20 sampled taught words + 20 control words. Three sub-tests per word: (a) spelling dictation from audio, (b) meaning MCQ with 4 options, (c) "write a sentence using ___", scored with the Section 8 rubric by **two blind raters**. |
| Immediate post-test | Day 21 (after the 4-week block). Same battery, items reordered. |
| Delayed post-tests | **+7 days** and **+14 days** after the post-test, with no app use in between. Also measured continuously in the app through spaced review items (F19). |
| In-app retention probe | Each day, 2 review words from 1, 3, 7 or 14 days earlier are re-tested on spelling (F19). This produces per-word retention curves at 7 and 14 days with no extra class time. |
| Engagement data | Sessions, streaks, time on task, hints, attempts. These are used as covariates and for dose-response analysis. |
| Attitude survey | A 5-item smiley-face Likert scale ("I like learning new English words") before and after. |

**Hypotheses.**

- **H1 (Spelling):** The treatment group's gain in spelling accuracy on taught words is significantly greater than the control group's gain (and greater than the treatment group's own gain on control words).
- **H2 (Meaning):** The treatment group's gain in meaning-MCQ accuracy is significantly greater than the control group's.
- **H3 (Productive use):** The treatment group's mean sentence-rubric score on taught words improves significantly more than the control group's.
- **H4 (Retention):** At +14 days, the treatment group retains at least 70% of its immediate post-test spelling gain. Words that got spaced review are retained better than words that did not.
- **H5 (Dose-response):** Within the treatment group, the number of completed sessions correlates positively with post-test gains (Spearman ρ > 0.3).
- **H6 (Attitude):** Attitude toward English vocabulary improves in the treatment group.

**Analysis plan.** Paired t-test (or Wilcoxon signed-rank if the data are non-normal) within groups. Independent t-test or Mann-Whitney U on gain scores between groups. ANCOVA with the pre-test as covariate if the groups differ at baseline. Report **Cohen's d** and 95% confidence intervals. Report inter-rater reliability for sentence scoring (Cohen's κ, target ≥ 0.70). Sample size: about 30 students per arm detects d ≈ 0.75 at α = 0.05 and power 0.8. With one division per arm (40-50 students), d ≈ 0.6 is detectable. State this limitation honestly in the Avishkar paper.

**Threats to validity to address explicitly:** novelty effect (the 4-week duration helps somewhat), Hawthorne effect, teacher effect (use the same teacher for both divisions if possible), contamination between divisions, and devices (see Open Question Q1).

---

## 2. Target Users and Personas

### 2.1 Primary persona: student, "Riya", age 10

- Standard 5, semi-English-medium Zilla Parishad or municipal school in the Thane or Pune district. Her mother tongue is Marathi.
- She reads simple English sentences slowly. She can copy text well but rarely writes original English sentences.
- She uses a parent's Android phone (2-3 GB RAM, shared, mobile data limited) or a school-lab tablet. **She has almost no typing experience.**
- She likes cartoons, collecting stickers and being praised by her teacher. She is anxious about being "last".
- **Needs:** large tappable targets, audio she can replay, Marathi help when stuck, short sessions, visible progress, and no public shame.

### 2.2 Secondary student persona: "Aarav", age 11

- Hindi-speaking family in Mumbai, English-medium aided school. He is confident and competitive.
- **Needs:** challenge, the leaderboard and streaks. **Risk:** he may try to "game" the scoring (very short sentences, copying the example). The design must reward genuine effort.

### 2.3 Primary admin persona: teacher, "Mrs. Patil", age 38

- Teaches English to two Standard 5 divisions of about 45 students each, plus other subjects. She has very limited free time.
- She uses WhatsApp and Google Forms comfortably. She has a smartphone and sometimes a school laptop or projector.
- **Needs:** set the week's words in under 5 minutes, see at a glance who did the work, and see *what kind* of help each child needs. She does not want to grade 225 sentences a day.

### 2.4 Out of scope for the MVP (noted)

| Role | Status | Rationale |
|---|---|---|
| **Parent/guardian** | Out of scope as an app user. **In scope as a consent giver**: consent is captured offline through the school (F3). | A parent portal adds auth, notification and privacy complexity. A weekly paper or WhatsApp summary that the teacher exports covers the need. |
| **School admin / headmaster** | **In scope (onboarding v2).** The super admin creates a school by invitation; the principal activates it from a one-time link, invites teachers with a school code, and sees school-wide progress. See `docs/ONBOARDING_SPEC.md`. | Schools need to onboard teachers and see adoption without engineering help. |
| **Researcher** | Served through a CSV export (F20), not a dedicated UI. | Researchers can use spreadsheets or SPSS. |

---

## 3. Goals and Non-Goals (MVP)

### 3.1 Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Students complete a 5-word daily session in **10-15 minutes** on a low-end Android phone. | Median session time ≤ 15 min |
| G2 | Teachers set or approve a week of words in **under 5 minutes**. | Measured in the teacher usability test |
| G3 | The app works in classrooms with **intermittent or no connectivity** once the day's content is cached. | Offline session completion test passes |
| G4 | Each student's errors are classified into **actionable categories** (spelling type, sentence rubric dimension). | 100% of attempts get a category; classifier ≥ 85% agreement with a manual label on a 200-item sample |
| G5 | The app produces **research-grade data** (attempt logs, pre/post export). | CSV export matches the schema in F20 |
| G6 | Engagement comes from **ethical** gamification. | Zero dark patterns per the Section 4.3 checklist; teacher survey |

### 3.2 Non-goals (explicitly out for the MVP)

- Native Android or iOS apps (the PWA covers this).
- Speech recognition or pronunciation scoring for students.
- Handwriting input or OCR.
- Free-form chat or AI tutor features.
- Student-to-student messaging, social feeds, or showing other students' sentences.
- Parent accounts, public school self-signup (schools are by invitation), cross-school analytics. (School-admin progress dashboards are in scope since onboarding v2.)
- Payments, ads, in-app purchases (never, not just for the MVP).
- Standards other than Standard 5. Subjects other than English vocabulary.
- **LLM-graded sentences as the official score** (LLM help is a Phase 2 suggestion to the teacher only; see Section 8).
- Full Marathi UI translation. The MVP has an **English UI with Marathi/Hindi hint glosses and audio**. Icons carry the navigation.

---

## 4. Hooked Model Mapping and Ethical Guardrails

Nir Eyal's model is **Trigger → Action → Variable Reward → Investment**. The users are 10-year-olds, so we use the model to **build a healthy daily learning routine**, not to maximise time-in-app. The success criterion is "completed today's 5 words", **not** "minutes spent".

### 4.1 Mapping

| Hooked phase | Concrete feature | Feature ID | Design notes |
|---|---|---|---|
| **External trigger** | (a) The teacher announces "Words of the Day" in class. A printable or projectable **"Today's Word Card"** (QR code plus class code). (b) Optional **one** PWA push notification per school day at a teacher-set time (default 5:00 pm), only on the parent's device with parental opt-in. (c) The app icon badge shows "5 new words". | F4, F14 | No notifications on weekends, holidays or after 7:30 pm. No repeat nags. |
| **Internal trigger** | Curiosity ("What's today's mystery word?"), the wish to keep the streak flame alive, wanting the mascot's **Word Garden** to grow, wanting the teacher's "Word Star" recognition. | F14 | We cultivate *curiosity and mastery*, not fear of loss (see streak forgiveness). |
| **Action** (make it easy) | **One huge "Play ▶" button** on the home screen. **2 taps or fewer** from opening the app to hearing the first word. Login is remembered on the device (avatar + 4-digit picture PIN). Each word stage is one screen with one task. | F8, F3 | Fogg's B = MAT: motivation is low to moderate, so ability must be very high. No reading is needed to start. |
| **Variable reward: Tribe** (social) | Class **weekly leaderboard** (top 10 plus "your rank"), the teacher's **"Word Star of the Day"** shout-out, a class-level goal ("Class 5B planted 180 words this week!"). | F15, F17 | Weekly reset so latecomers can win. Bottom ranks are never shown. The teacher can switch the leaderboard to "class goal only" mode. |
| **Variable reward: Hunt** (resources) | A **Mystery Seed Chest** after completing all 5 words: one random cosmetic (a sticker for the mascot, a garden flower, an avatar accessory) from a disclosed pool. Rarity varies. **Cosmetic only, never purchasable, odds shown.** | F14 | This is the "variable" in variable reward. It is decoupled from XP so it cannot distort learning incentives. |
| **Variable reward: Self** (mastery) | Varied, specific praise ("You spelt *enormous* on the first try!"). **"Perfect Word" gold stars**. Each mastered word grows into a plant in the **Word Garden** (mastered = passed spaced review at day 7). Level-ups every N XP. | F12, F14, F19 | Praise targets effort and strategy, not "you're smart". |
| **Investment** | (a) **Writing one's own sentence** creates a personal **"My Sentence Book"** (the student's sentences, viewable only by them and the teacher). (b) The garden accumulates. (c) Avatar customisation using earned stickers. (d) The streak. (e) A "Tomorrow's word starts with **J**…" teaser loads the next trigger. | F12, F14 | Investment is *learning artefacts*, not sunk social capital. |

### 4.2 Why this mapping fits the learning goals

- The **reward follows the effortful production step** (the sentence), so the most valuable behaviour is reinforced.
- Chest randomness is **not tied to performance**. Otherwise low performers would also get fewer rewards, which compounds disadvantage. Completing the session is enough.
- Gold stars and the garden reward **accuracy and retention**. The leaderboard rewards **effort and consistency**, because XP is mostly completion-driven (see Section 7). This balance protects weaker learners.

### 4.3 Ethical guardrails for children (mandatory requirements)

| ID | Guardrail | Implementation |
|---|---|---|
| EG1 | **Daily cap** | Exactly 5 new words per day. After the session plus 2 review words, the app shows "All done for today! See you tomorrow 🌱". Optional practice of past words is allowed for up to 10 minutes and earns **no leaderboard XP**. |
| EG2 | **No pay-to-play, no ads** | No purchases, no currency that can be bought, no third-party ads or ad SDKs. |
| EG3 | **No manipulative loss framing** | No "Your mascot is sad/dying" messages. No countdown timers. No "Your friends are ahead of you!" pushes. |
| EG4 | **Streak forgiveness** | Streaks count **school days only** (the teacher's calendar). The student automatically earns 1 **Streak Shield** for every 5-day streak (max 2 held). Missing a day uses a shield silently. A broken streak shows "Let's start a new streak!" with no shame. |
| EG5 | **Leaderboard safety** | Class scope only. First name + avatar only, never a surname. Top 10 + own rank. Weekly reset. The teacher can switch to "Class Goal" mode (no individual ranks). Also shows a **"Most Improved"** board so non-top students can be recognised. |
| EG6 | **Transparent randomness** | Chest odds are displayed. Rewards are cosmetic only. Nothing can be bought or traded. |
| EG7 | **Notifications** | Off by default. Parental opt-in only. At most 1 per school day. Quiet hours 7:30 pm-7:00 am. |
| EG8 | **Privacy by design (DPDP Act 2023)** | Verifiable parental consent before any personal data is processed. Data minimisation (first name, class, roll number). No behavioural advertising. No tracking outside the app. Data stored in India (Mumbai region). See Section 13.4. |
| EG9 | **No public exposure of student writing** | Sentences are visible only to the student and their teacher. |
| EG10 | **Healthy session length** | If the session exceeds 25 minutes, show a gentle "Great work! Take a break" message. |

> **DPDP Section 9 note (critical):** The Act prohibits "tracking or behavioural monitoring of children" and targeted advertising directed at them, subject to exemptions notified under the DPDP Rules, 2025. These include processing by educational institutions for educational activities and the child's interest. Our per-student learning analytics are **educational monitoring by the school**, which is expected to fall within that exemption. This must be **confirmed by the faculty advisor or the university ethics committee before the pilot** (see Q3). The design keeps analytics strictly educational, teacher-only, and never used for advertising or profiling outside learning.

---

## 5. User Stories and Acceptance Criteria

IDs: `US-S#` for students, `US-T#` for teachers, `US-R#` for researchers.

### 5.1 Student stories

**US-S1 Log in easily.** As a student, I want to log in by tapping my class, my avatar and my picture PIN, so that I do not need to type an email or password.
- AC1: The first login on a device requires the class code (6 characters, from the teacher's card) + avatar selection + 4-picture PIN (from 9 icons).
- AC2: Later visits on the same device show "Is this you?" with the avatar and a one-tap continue, plus PIN re-entry after 7 days or after another student uses the device.
- AC3: The device supports up to **10 remembered students** (for a shared family or lab device). Each sees only their own data.
- AC4: The student cannot proceed if the teacher has not marked parental consent as received (a friendly "Ask your teacher" screen is shown).

**US-S2 Start today's words.** As a student, I want to press one big button to start, so that I can begin without reading instructions.
- AC1: The home screen shows the Play button, streak flame, today's progress (0/5 dots), and the garden.
- AC2: Hearing the first word takes **2 taps or fewer** from home.
- AC3: If the session is half done, Play resumes at the exact stage.

**US-S3 Hear and spell.** As a student, I want to hear the word and type its spelling, so that I learn to spell from sound.
- AC1: The audio auto-plays once on screen load (after the first user interaction, to satisfy autoplay policy). The 🔊 button replays it at normal speed and 🐢 replays it at 0.7× speed, unlimited and free.
- AC2: An in-app letter keyboard is shown (no device keyboard, so no autocorrect).
- AC3: Up to 3 attempts. Feedback after each wrong attempt follows Section 7.2. After the 3rd wrong attempt the answer is revealed and the student must type it once correctly (no marks) to continue.
- AC4: Case-insensitive. Leading and trailing spaces are ignored.
- AC5: Every attempt is stored with the raw input and classified error tags (Section 9).

**US-S4 Learn the meaning.** As a student, I want to see the meaning, a picture and an example sentence, with an optional Marathi or Hindi hint, so that I understand the word.
- AC1: The screen shows the word, part-of-speech icon, a simple English meaning (≤ 12 words), an example sentence with the word highlighted, and an optional picture or emoji.
- AC2: The "मराठी" or "हिंदी" toggle shows the gloss. The language preference is remembered.
- AC3: 🔊 plays both the meaning and the example sentence audio.

**US-S5 Check the meaning.** As a student, I want a quick tap-quiz on the meaning, so that I know I understood it.
- AC1: A 3-option MCQ. The type alternates: "Which picture/meaning matches *brave*?" or "Which sentence uses *brave* correctly?"
- AC2: 2 attempts maximum. After that the answer is revealed and explained.
- AC3: Options are shuffled. The distractors come from the word bank entry.

**US-S6 Write my own sentence.** As a student, I want to write my own sentence with the word, so that I can practise using it.
- AC1: The text box uses the device keyboard with `autocomplete/autocorrect/spellcheck` disabled where the browser supports it. The target word is shown above with a 🔊 button. A "Sentence starter" hint is available (costs marks, see Section 7).
- AC2: On submit, instant rule-based feedback appears within 1 second, offline: ✅ used the word / ✅ capital letter / ✅ full stop / ✅ long enough / ⚠️ looks copied.
- AC3: 2 submissions maximum. The second submission is scored with a 0.8 multiplier.
- AC4: If inappropriate content is detected, the sentence is not scored, a gentle message appears, and the teacher is flagged (Section 13.6).
- AC5: Sentences in Devanagari script are rejected with "Please write in English letters 🙂" (not counted as an attempt).

**US-S7 See my rewards.** As a student, I want to see my XP, streak, stars and a surprise chest when I finish, so that I feel proud.
- AC1: The summary screen shows marks per word (stars), XP earned, streak, and the chest opening animation (≤ 3 s, skippable).
- AC2: The new sticker is added to the collection. The garden updates.

**US-S8 See the class leaderboard.** As a student, I want to see where I stand this week, so that I feel motivated.
- AC1: Top 10 + own rank, first name + avatar. Resets Monday 00:00 IST.
- AC2: The "Most Improved" tab is present.
- AC3: Hidden entirely when the teacher has selected "Class Goal" mode.

**US-S9 Work offline.** As a student, I want to finish today's words even if the internet drops, so that I don't lose my work.
- AC1: Once the day's pack has downloaded, all three stages work offline, including audio.
- AC2: Attempts queue locally and sync automatically when online. A small "☁️ saved" or "⏳ waiting to save" indicator is shown.
- AC3: No data loss if the app is closed mid-session.

**US-S10 Review old words.** As a student, I want 2 quick review words from earlier days, so that I remember them.
- AC1: 2 spelling-only review items appear **before** the new words (warm-up). They are chosen by the spacing schedule (F19).
- AC2: A correct review marks the word as "growing" or "mastered" in the garden.

### 5.2 Teacher stories

**US-T1 Set up my class.** As a teacher, I want to create a class and add students quickly, so that they can log in.
- AC1: Teacher signup by email + password or magic link. Teachers are pre-approved by the research team (allowlist).
- AC2: Create a class (name, division, academic year). The system generates a class code.
- AC3: Add students by pasting a list (one per line: `roll number, first name`) or one at a time. The system assigns avatar suggestions and PINs.
- AC4: **Printable login cards** (PDF, 8 per A4 page): class code, avatar, PIN icons.
- AC5: Per student, a "Consent received" checkbox with date, and an optional upload of a scanned consent form. Students without consent cannot use the app.

**US-T2 Create daily words manually.** As a teacher, I want to type or pick 5 words for a date, so that they match my lesson.
- AC1: Select a date. Pick from the word bank (search or filter by theme, POS, difficulty) **or** add a custom word (word, meaning, example, optional gloss, 2 distractor meanings).
- AC2: Custom words get audio automatically (F7 pipeline). Until the audio is ready, the set shows "audio pending". A set **cannot be published** while any audio is missing.
- AC3: Exactly 5 words per set. Warn on duplicates of words used in the last 30 days.

**US-T3 Auto-generate a week of words.** As a teacher, I want the app to suggest 5 words per day for the week, which I approve or edit, so that it takes minutes.
- AC1: "Auto-fill week" proposes sets for Mon-Fri using the rules in F6.
- AC2: The teacher can swap any word (🔄 suggests an alternative of the same difficulty and POS), edit any field, reorder, and approve.
- AC3: Only **approved** sets are visible to students. An unapproved day shows "No words today" to students and a red warning to the teacher by 8:00 am.

**US-T4 See who did the work.** As a teacher, I want a daily completion grid, so that I can follow up.
- AC1: The grid shows students × days (this week). Cells: ✅ complete, ◐ partial, ✗ not started, 🚫 absent/holiday.
- AC2: Tap a student to see details for each word: attempts, hints, marks, the sentence text and rubric scores.

**US-T5 See the leaderboard and choose its mode.** As a teacher, I want to see the leaderboard and switch modes.
- AC1: Weekly and all-time views. Toggle: Individual / Class Goal / Hidden.

**US-T6 See weaknesses.** As a teacher, I want each student's error profile, so that I know who needs spelling help and who needs sentence help.
- AC1: Per-student card: spelling accuracy (first attempt), **top 2 spelling error categories** with examples, and sentence rubric averages for each dimension (word use, grammar, relevance, length).
- AC2: An auto-generated label such as "Needs support: silent letters" or "Needs support: sentence grammar". It appears only when the student has ≥ 10 relevant events and the category rate is ≥ 1.5× the class average (to avoid noisy labels).
- AC3: Class view: a heatmap of students × error categories. Sort by any column.
- AC4: The "Hardest words this week" list (lowest first-attempt accuracy).

**US-T7 Review and override sentence scores.** As a teacher, I want a short review queue of sentences flagged as uncertain or inappropriate, so that scoring stays fair without me grading everything.
- AC1: The queue contains flagged sentences (copy-suspect, low-confidence relevance, moderation flags) plus a random 10% sample. The target is ≤ 20 items per class per day.
- AC2: One-tap rubric override (each dimension) and a "Looks good" bulk approve. Overrides recompute marks and XP and are logged for inter-rater analysis.

**US-T8 Set the school calendar.** As a teacher, I want to mark holidays and exam days, so that streaks and auto-generation skip them.

### 5.3 Researcher stories

**US-R1 Export data.** As a researcher, I want CSV exports of attempts, sessions, scores and teacher overrides with pseudonymous student IDs, so that I can analyse them in Excel or SPSS.
- AC1: Export files: `students.csv` (pseudo_id, class, group label), `attempts.csv`, `sentences.csv`, `daily_summary.csv`, `review_attempts.csv`. Schema per F20.
- AC2: No names in the research export. A key file mapping pseudo_id to roll number is a separate, teacher-only download.

**US-R2 Tag research groups.** As a researcher, I want to mark classes as treatment or control and record pre/post test scores, so that the analysis lives in one place.
- AC1: A class has a `research_group` field. An offline test score import is available by CSV upload (simple). The paper-based test itself is administered outside the app.

---

## 6. Functional Requirements: Feature Increments F1-F22

**Conventions.** Each increment is sized for **one agent → one branch → one PR**. Sizes: **S** ≈ 0.5 day, **M** ≈ 1 day, **L** ≈ 2 days of agent work. Every PR must include tests for pure logic (Vitest) and must not break the `main` build. Pure-logic modules (scoring, error classifier, sentence evaluator, set generator) live in `packages/core` with **no UI or DB dependencies**. That lets them be built in parallel from day 1 against the shared types in F2.

Build order is grouped into **waves** (parallelisable within a wave). See Section 17 for the table.

---

### Wave 0: Foundation

#### F1: Project scaffold, CI and design tokens (M)
- Monorepo (pnpm workspaces): `apps/web` (React 18 + Vite + TypeScript), `packages/core` (pure TS logic), `supabase/` (migrations, seed, edge functions).
- `vite-plugin-pwa` (Workbox) with manifest, icons and an offline fallback page.
- Tailwind CSS with design tokens: colours (high contrast), font sizes (base 18px, buttons 22px), spacing, 56px minimum touch targets.
- i18n scaffold (`i18next`) with `en` UI strings and `mr`/`hi` hint-string namespaces.
- ESLint, Prettier, Vitest, Playwright (one smoke test). GitHub Actions: lint + typecheck + test + build on PR.
- React Router routes stubbed: `/`, `/login`, `/play`, `/summary`, `/leaderboard`, `/garden`, `/teacher/*`.
- **Done when:** `pnpm build` produces an installable PWA that passes the Lighthouse PWA check. CI is green.

#### F2: Database schema, RLS, shared types and seed (L)
- Supabase migrations for all entities in Section 10.
- **Row Level Security:** a teacher sees only their classes. A student session sees only their own rows (see F3 for the auth model). Research export runs only through a service-role edge function.
- `supabase gen types` → `packages/core/src/db-types.ts`, plus hand-written domain types (`Word`, `DailySet`, `Attempt`, `SpellingErrorTag`, `RubricScore`, etc.). **This is the contract all parallel agents code against. Merge it first.**
- Seed: 1 demo school, 1 demo teacher, 1 class, 10 demo students, the **150-word Standard 5 bank** (Appendix A shows the first 15; the content team supplies the rest as CSV), and holiday calendar 2026-27.
- **Done when:** migrations apply on a clean project, RLS tests pass (a teacher cannot read another class; a student cannot read another student's attempts), and types are exported.

---

### Wave 1: Identity and content

#### F3: Authentication and consent gating (L)
- **Teacher:** Supabase Auth with email + password or magic link. Signup is restricted by an `approved_teachers` email allowlist.
- **Student:** no email. A custom edge function `student-login` verifies `{class_code, student_id, pin_icons[4]}`. PINs are stored as a salted hash. It issues a **custom JWT** (Supabase-compatible, `role=student`, `student_id` claim, 30-day expiry) used for RLS.
- Rate limit: 5 wrong PINs → 5-minute lockout per student, and the teacher can reset the PIN.
- Device "remembered students" list (≤ 10) in IndexedDB: avatar + name + token. "Switch student" control.
- Consent gate: `student.consent_status != 'received'` → blocked screen.
- **Done when:** US-S1 and the consent ACs of US-T1 pass in Playwright.

#### F4: Teacher class and roster management (M)
- Create and edit a class, generate a class code, paste-import the roster, edit students, reset a PIN, mark consent (+ optional scan upload to private storage).
- Printable login cards (client-side PDF via `@react-pdf/renderer`, or a print stylesheet; prefer the **print stylesheet** for bundle size).
- School calendar editor (holidays, exam days). **Notification time setting** is stored here for F14.
- **Done when:** US-T1, US-T8 pass.

#### F5: Word bank browser and manual daily set editor (M)
- Teacher word bank list: search, filters (theme, POS, difficulty 1-3), "used on" dates.
- Daily set editor: date picker, 5 slots, pick from the bank or "custom word" form (word, POS, meaning ≤ 12 words, example sentence, Marathi gloss, Hindi gloss, 2 distractor meanings, allowed inflections auto-suggested, context words).
- Validation: exactly 5 words. The example must contain the word. Warn on reuse within 30 days.
- States: `draft → approved`. Students can only read approved sets for the current date (or earlier, for catch-up).
- **Done when:** US-T2 passes (except audio, which F7 covers).

#### F6: Auto-generate the week's sets (S, core logic + small UI)
- `packages/core/generateWeek(bank, history, calendar, opts)` as a pure, seeded-random function.
- **Rules:** school days only. Words unused by this class in the last 60 days. Per day: **2 easy, 2 medium, 1 hard**, and at least 2 nouns, 1 verb and 1 adjective. Prefer the selected theme for the week (e.g., "Nature", "Festivals", "School") if one is chosen. Do not repeat a starting letter within a day (helps audio discrimination).
- UI: "Auto-fill week" button → draft sets → per-word 🔄 swap (same difficulty + POS) → "Approve week".
- **Done when:** unit tests cover the constraints and US-T3 passes.

#### F7: Audio pipeline and offline audio cache (M)
- **Decision: pre-generated TTS audio files**, not runtime Web Speech API (see Section 11.3).
- Script `scripts/generate-audio.ts`: for each word, generates (a) the word, (b) the word at slow speed, (c) the meaning, (d) the example sentence. It uses a cloud neural TTS with an **Indian English voice** (e.g., Google Cloud TTS `en-IN` or Azure `en-IN`), with Marathi gloss audio from an `mr-IN` voice. Output is **Opus/WebM at 24 kbps mono** with an AAC fallback for old iOS. Files are uploaded to Supabase Storage at `audio/{word_id}/{kind}.webm`.
- An edge function `generate-audio` handles custom teacher words on demand and sets `audio_status`.
- Client `<AudioButton>` component: play, slow replay, loading state, error fallback → Web Speech API `speechSynthesis` with `en-IN` if available, else shows the word text with a "🔇 audio unavailable" note (spelling scored with `audio_fallback=true` for the research data).
- The service worker pre-caches the **day pack** (today + tomorrow's approved words and the review words' audio) on first open each day.
- **Done when:** audio plays offline after one online load, and the pack size for 7 words is under 400 KB.

---

### Wave 2: Core learning loop (pure logic in parallel with UI)

#### F8: Student home, daily session shell and state machine (M)
- Home: Play button, streak, 0/5 progress dots, garden thumbnail, leaderboard icon.
- Session state machine (XState or a small reducer): `warmup_review[0..2] → word[i].spell → word[i].learn → word[i].check → word[i].sentence → summary`.
- Persists after every step to IndexedDB (Dexie). Resume exactly where the student left off.
- "No words today" and "All done today" states. **Catch-up rule:** a student can complete only **today's** set for streak and leaderboard. Missed past sets can be done in practice mode for marks in analytics, but give **50% XP** (prevents a bulk-catch-up grind while still letting absent students learn).
- **Done when:** a full session runs end-to-end using stub stage components.

#### F9: Scoring engine (S, `packages/core`)
- Pure functions implementing Section 7 exactly: `scoreSpelling(attempts, hints)`, `scoreMeaning(attempts)`, `scoreSentence(rubric, submissionNo, hints)`, `dailyXP(wordScores, streak, review, isCatchUp)`, `streakUpdate(prev, date, calendar, shields)`.
- All constants in one `scoring.config.ts` so researchers can tune them. The config version is stored on every score row.
- **Done when:** unit tests reproduce all worked examples in Section 7.6 exactly.

#### F10: Spelling error classifier (M, `packages/core`)
- `classifySpelling(target, attempt, lexicon) → SpellingErrorTag[]`, implementing the Section 9.1 taxonomy.
- Algorithm: normalise → Damerau-Levenshtein alignment with an operation trace → rule checks in priority order (homophone list → real-word error → silent letter → double letter → vowel substitution/omission → phonetic equivalence via simplified **Double Metaphone** comparison plus an Indian-English rule list such as v/w, sh/s, z/j, schwa vowels → transposition → omission/insertion/substitution → far-miss).
- Ships with a **200-pair labelled fixture** (built by the B.Ed team from real Standard 5 errors) as the test set. Target ≥ 85% top-tag agreement.
- **Done when:** the test passes the threshold and runs in < 2 ms per call.

#### F11: Stage 1 UI: Listen & Spell (M)
- Screen: big 🔊 and 🐢 buttons, letter boxes (slot count hidden until after attempt 1), **custom on-screen QWERTY keyboard** (large keys, backspace, no device keyboard), Check button.
- Hint buttons: 💡 "First letter" and 🧩 "Letter tiles" (shows the scrambled letters of the word as the keyboard). The cost is shown on the button.
- Feedback per Section 7.2, with gentle animation and sound. Calls `scoreSpelling` and `classifySpelling` and writes `attempt` rows.
- **Done when:** US-S3 passes. Works with screen width 320px.

#### F12: Stage 2 UI: Learn & Check (S)
- Learn card (meaning, picture/emoji, example, POS icon, gloss toggle, audio). Minimum dwell of 3 s before "Next" is enabled (prevents tap-through).
- Check: 3-option MCQ, alternating type (meaning-match vs correct-usage sentence). Distractors come from the word record. Calls `scoreMeaning`.
- **Done when:** US-S4 and US-S5 pass.

#### F13: Rule-based sentence evaluator (M, `packages/core`)
- `evaluateSentence(sentence, word, ctx) → { rubric: {use, grammar, relevance, length}, flags[], confidence, feedback[] }`, implementing Section 8.2.
- Includes: inflection matcher (the word's `allowed_forms`, plus a regular suffix generator for -s/-es/-ed/-ing/-er/-est/-ly), copy detector (token Jaccard similarity to the example sentence ≥ 0.6 → `copied`), basic-English lexicon (~5,000 words, ≤ 40 KB gzipped) for the gibberish check, conjunction list, context-word overlap, Devanagari detection, and the moderation word list hook (F18).
- **Done when:** a 100-sentence labelled fixture gives ≥ 0.6 Cohen's κ against teacher labels on the `use` and `length` dimensions, and evaluation takes < 20 ms.

#### F14: Stage 3 UI: Write Your Sentence, plus session summary (M)
- Sentence screen: target word chip with audio, multi-line input (`autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"`), 💬 "Sentence starter" hint (e.g., "The ___ …" pattern stored per word), Submit, instant checklist feedback, retry once.
- Summary screen: per-word stars (≥ 90 = 3★, ≥ 60 = 2★, ≥ 30 = 1★), XP breakdown, streak, chest.
- **Done when:** US-S6 and US-S7 pass (chest animation can be a placeholder until F15).

---

### Wave 3: Gamification, sync and teacher insight

#### F15: Gamification: XP ledger, streaks, shields, chest, garden, avatar (M)
- XP ledger (append-only), streak computation via `streakUpdate` (school calendar aware), Streak Shield earn/consume, levels (every 500 XP), Mystery Seed Chest (a disclosed weighted pool: common 70% / rare 25% / super-rare 5%, cosmetic only, with a **pity rule**: a rare item is guaranteed at least once every 5 chests), sticker collection, Word Garden (seed → sprout after the day's session → flower once mastered via review), avatar customisation.
- Optional push notification (Web Push via an edge function cron) respecting EG7. **Opt-in screen addressed to the parent.**
- **Done when:** the streak tests cover holidays and shields, and EG1, EG3, EG4, EG6 and EG7 pass the checklist.

#### F16: Leaderboard (S)
- Weekly XP leaderboard (Mon-Sun IST), Most Improved (week-over-week change in first-attempt spelling accuracy and average sentence score, minimum 3 sessions), teacher mode toggle (Individual / Class Goal / Hidden).
- Computed by a Postgres view or materialised view refreshed on sync. The client caches the last result for offline display.
- **Done when:** US-S8 and US-T5 pass.

#### F17: Offline sync engine (M)
- Dexie outbox: every attempt, sentence and session event gets a client UUID and timestamp. Background sync on `online` and on app focus, with exponential backoff. Idempotent upserts by client UUID.
- **The server is authoritative for XP.** The client computes provisional scores using the same `packages/core`. The server edge function `submit-session` recomputes from raw attempts and returns the canonical values. Mismatches are logged.
- Conflict policy: the first completed session per student per date wins, and later duplicates are stored but flagged.
- **Done when:** a Playwright test with `context.setOffline(true)` completes a full session, reconnects, and the server reflects it with zero loss.

#### F18: Content moderation (S)
- Blocklists: English profanity + **transliterated Marathi/Hindi abuse terms** (curated by the team, stored server-side and shipped hashed to the client) + PII patterns (10-digit phone numbers, emails, "my address is").
- Client blocks with a gentle message. The server re-checks. Flagged sentences are hidden from scoring and queued for teacher review (US-T7). The teacher is notified on the dashboard. Repeated flags (≥ 3 per week) are highlighted for the teacher's offline conversation, never auto-punished.
- **Done when:** fixture tests pass and flagged items appear in the review queue.

#### F19: Spaced review and retention probe (M)
- Leitner-style schedule per (student, word): review due at +1, +3, +7, +14 school days after first learning. A correct review advances the box. An incorrect one resets to +1.
- Daily warm-up: up to **2** due reviews (oldest due first; ties broken by preferring 7- and 14-day items for research coverage). Spelling-only, 1 attempt, 10 XP each, no penalty.
- Mastery = correct at the +7 review → garden flower.
- Stores `review_attempt` rows with `interval_days`, which feed the retention metric.
- **Done when:** schedule tests pass and the warm-up appears in F8.

#### F20: Teacher dashboard: completion grid, student detail, review queue (L)
- Completion grid (US-T4), student detail drill-down, sentence review queue with rubric override (US-T7), "Word Star of the Day" pick (auto-suggest: highest score today, ties broken by improvement; the teacher confirms).
- Mobile-first (the teacher uses a phone), with a table view at ≥ 768px.
- **Done when:** US-T4 and US-T7 pass.

#### F21: Weakness analytics view (M)
- Per-student error profile card and class heatmap (US-T6). Postgres views aggregate `spelling_error_tag` and `sentence_rubric` per student per category, with rolling 14-day and all-time windows.
- Label rules: min 10 events, rate ≥ 1.5× class mean, at most 2 labels per student. Each label links to example errors and a **suggested remedial activity** (static text per category, e.g., "Silent letters: practise wh-, kn-, -mb words; see list").
- "Hardest words this week" list.
- Simple bar charts (lightweight SVG components, no heavy chart library).
- **Done when:** US-T6 passes on seeded synthetic data.

#### F22: Research export and group tagging (S)
- Edge function `research-export` (teacher of the class or the researcher role) → zip of CSVs (US-R1). Pseudonymous IDs = HMAC(student_id, project_salt).
- Class `research_group` field. CSV import of pre/post paper test scores into `assessment_score`.
- **Columns of `attempts.csv`:** pseudo_id, class_id, date, word, stage, attempt_no, input_text, is_correct, error_tags, hints_used, ms_elapsed, audio_fallback, marks_awarded, scoring_config_version, offline_flag.
- **Done when:** the export opens cleanly in Excel with UTF-8 BOM, and no names appear.

---

### Phase 2 (post-pilot, not in MVP build)

- **F23: LLM-assisted sentence suggestions** to the teacher (Section 8.3), behind a feature flag.
- **F24: AI-suggested words** for the bank (LLM proposes candidates plus meanings, examples and glosses; the B.Ed team approves before they enter the bank).
- **F25:** Parent weekly summary (WhatsApp-shareable image or PDF).
- **F26:** Full Marathi UI, Standards 4 and 6 banks.

---

## 7. Scoring System

### 7.1 Design principles

1. **100 marks per word, 500 per day.** Easy for teachers and researchers to read as a percentage.
2. **The weighting reflects the learning objective.** Production (sentence) and recall-spelling are weighted most. The meaning check is recognition, so it gets the least weight.
   - **Spelling: 40 · Meaning check: 20 · Sentence: 40**
3. **Wrong attempts decay marks geometrically, never below 0.** A wrong attempt never subtracts XP already earned.
4. **XP ≠ marks.** Marks measure learning (analytics, research). XP drives the game and adds completion and consistency bonuses, so effort is rewarded even for weaker students.

### 7.2 Stage 1: Spelling (max 40)

| Attempt | Multiplier | Marks before hints | Feedback after a wrong attempt |
|---|---|---|---|
| 1st correct | 1.00 | 40 | n/a |
| 2nd correct | 0.60 | 24 | After wrong #1: "Almost! Listen again 🔊" + the **number of letter boxes** is shown |
| 3rd correct | 0.30 | 12 | After wrong #2: correctly placed letters turn **green** in the boxes |
| 3 wrong | 0 | 0 | Answer revealed, the student copies it once (unscored), error tags saved |

**Hints** (deducted after the multiplier, floor 0; each hint can be used once per word):
- 🐢 Slow replay and 🔊 replay: **free** (audio is the task, not a hint).
- 💡 First letter: **−6**
- 🧩 Letter tiles (the keyboard shows only the word's letters, scrambled): **−14**

`spelling = max(0, round(40 × m[attempt]) − Σ hint_cost)`

### 7.3 Stage 2: Meaning check (max 20)

| Outcome | Marks |
|---|---|
| Correct on 1st tap | 20 |
| Correct on 2nd tap | 8 |
| Wrong twice | 0 (answer explained) |

There are 3 options, so random guessing gives an expected score of 20 × ⅓ + 8 × ⅓ × ½ ≈ 8. Accept this. The stage exists mainly for learning and engagement, which is why its weight is the lowest.

### 7.4 Stage 3: Sentence (max 40)

Rubric (Section 8.2 defines how each dimension is computed):

| Dimension | Max | What it measures |
|---|---|---|
| R1 Uses the word | 10 | Target word (or an allowed inflection) is present. **Gate:** if R1 = 0, the sentence is not scored; the student is asked to include the word, and this does not count as a submission. |
| R2 Grammar and mechanics | 10 | Capital letter, end punctuation, real-English-word ratio, contains a verb |
| R3 Meaning relevance | 12 | The word is used in a meaningful context (context words / POS slot), teacher-overridable |
| R4 Length and complexity | 8 | Word count tiers + conjunction/clause bonus |

- **Submission 1:** rubric total × 1.0. **Submission 2** (optional, after feedback): rubric total × **0.8**. The *higher* of the two final values is kept. A retry therefore never lowers the score, which removes the fear of retrying.
- **Hint:** 💬 Sentence starter **−5** (applied after the multiplier, floor 0).
- **Copy penalty:** if `copied` (Jaccard ≥ 0.6 with the example sentence), R3 = 0 and R4 = 0, and the student gets "Try writing your own idea!" with a retry.
- **Teacher override** replaces any dimension and the total is recomputed.

`sentence = max(0, round(Σ R × (sub==2 ? 0.8 : 1.0)) − hint_cost)`, then `best(sub1, sub2)`.

### 7.5 Daily XP

| Component | XP |
|---|---|
| Word marks (5 words) | sum of marks (0-500) |
| Completion bonus (all 5 words finished, today's set) | +25 |
| Streak bonus | +5 × current streak (school days), **capped at +50** (from day 10) |
| Review warm-up | +10 per correct review word (max +20) |
| Perfect word (100/100) | +5 each (max +25) |
| Catch-up (a past day's set) | 50% of word marks. No completion or streak bonus. **Does not count for the leaderboard week** |
| Optional practice | 0 XP |

**Maximum daily XP = 500 + 25 + 50 + 20 + 25 = 620.** A struggling but consistent student (≈ 50 marks per word, 8-day streak) earns about 250 + 25 + 40 + 10 ≈ **325**, about half of the top student's XP. That is a deliberate design choice: consistency keeps everyone visible on the weekly board.

**Levels:** Level n requires 500 × n cumulative XP (Level 1 at 500, Level 2 at 1,500, …). Level-up gives a guaranteed chest.

**Streak:** +1 for each school day on which today's set is completed before 23:59 IST (by device time at the attempt, validated server-side within ±2 days for offline sync). Holidays and weekends are skipped. Shields: +1 per 5 consecutive days, max 2. One shield is auto-consumed per missed school day.

### 7.6 Worked examples

**Example A: Riya, word "brave"** (strong student)
- Spelling: "brave" on attempt 1, no hints → 40 × 1.0 = **40**
- Meaning: correct on the first tap → **20**
- Sentence: "The brave soldier saved the village." → R1 10, R2 10 (capital ✓, full stop ✓, all real words ✓, verb "saved" ✓), R3 12 (context words "soldier" and "saved" match), R4 4 (6 words → 4; no conjunction) = 36 × 1.0 = **36**
- **Word total = 96/100 → 3★** (≥ 90). Not a "Perfect word" (needs 100), so no +5 bonus.

**Example B: Aarav, word "enormous"** (average student)
- Spelling: attempt 1 "enormus" ✗ (tags: `vowel_omission`, `phonetic_equivalent`). Attempt 2 "enormous" ✓ → 40 × 0.6 = **24**
- Meaning: wrong, then correct → **8**
- Sentence: "elephant is enormous" → R1 10, R2 6 (no capital 0/2, no full stop 0/2, real words 4/4, verb 2/2), R3 12 (context word "elephant"), R4 0 (3 words < 4) = **28**
- **Word total = 60/100 → 2★.** The feedback suggests adding a capital letter, a full stop and more words.

**Example C: Kabir, word "whisper"** (struggling with spelling, good at sentences)
- Spelling: "wisper" ✗ (`silent_letter_omission`), "wispar" ✗ (`silent_letter_omission`, `vowel_substitution`), "whispar" ✗ (`vowel_substitution`) → **0**. He copies "whisper" once.
- Meaning: correct → **20**
- Sentence submission 1: "The girl whispered a secret to her friend." This is nearly identical to the example → `copied` → R1 10, R2 10, R3 0, R4 0 = 20.
  Submission 2: "I whisper to my friend because the teacher is teaching." → R1 10, R2 10, R3 12, R4 8 (10 words → 6, "because" → +2) = 40 × 0.8 = 32. Best = **32**
- **Word total = 52/100 → 1★.** Analytics records Kabir's spelling weakness (silent letters, vowels) and his sentence strength. This is exactly the pattern the teacher view needs to surface.

**Example D: Aarav's whole day**
Word marks 96 + 60 + 72 + 85 + 52 = 365. Completion +25. Streak of 4 days → +20. Review: 1 of 2 correct → +10. Perfect words: none.
**Daily XP = 365 + 25 + 20 + 10 = 420.**

**Example E: hint use.** Spelling "journey": attempt 1 with 💡 first letter, typed "jurney" ✗. Attempt 2 "journey" ✓ → round(40 × 0.6) − 6 = **18**.

---

## 8. Sentence Evaluation Approach

### 8.1 Options compared

| Criterion | A. Rule-based (on device) | B. LLM-assisted (server) | C. Teacher-only grading |
|---|---|---|---|
| Works offline | ✅ yes | ❌ no (needs network) | ✅ (delayed) |
| Instant feedback to the child | ✅ < 50 ms | ⚠️ 1-4 s when online; none offline | ❌ next day |
| Judges *meaning* | ❌ weak (heuristics) | ✅ good, with occasional errors | ✅ best |
| Consistency / reproducibility (research) | ✅ deterministic | ⚠️ non-deterministic; versioned prompts needed | ⚠️ rater drift |
| Cost | Free | Low but nonzero: ~225 sentences/class/day × small model; on the order of a few hundred rupees per class per month at current small-model pricing (verify before Phase 2) | Teacher time (~225 sentences/day is not feasible) |
| Privacy (minors, DPDP) | ✅ data stays local + own DB | ⚠️ children's text goes to a third-party processor; needs a DPA, consent wording, PII scrubbing | ✅ |
| Gameability | ⚠️ gameable (keyword stuffing) | ✅ harder to game | ✅ |
| Build effort | M | M + prompt evaluation | S |

### 8.2 Recommendation: hybrid, rule-based for scoring plus a teacher review queue in the MVP; LLM as a Phase 2 teacher assistant

**MVP = Option A + targeted teacher review.**

- The rule-based evaluator gives **instant, offline, deterministic** feedback and provisional marks, which is crucial for research reproducibility.
- **Low-confidence and flagged** sentences (copy-suspect, no context word found, moderation hits) plus a **random 10%** go into the teacher's review queue (≤ 20 per class per day), where she can override in one tap. The overrides become (a) final scores and (b) a labelled dataset for measuring rule accuracy (κ) and for evaluating any later LLM.
- **Do not make an LLM the official scorer in the MVP.** Offline classrooms, child-data privacy, non-determinism (which weakens the research claim) and dependence on an external API during a time-boxed competition all argue against it.

**Phase 2 (F23):** a server-side LLM produces a **suggested rubric score plus a one-line child-friendly tip**. It runs asynchronously when online, on PII-scrubbed text, with a fixed versioned prompt and temperature 0. It is shown **to the teacher only** as a pre-filled suggestion in the review queue. Promote it to auto-scoring only if teacher-agreement κ ≥ 0.75 on ≥ 500 sentences.

**Rule-based dimension definitions (MVP):**

| Dim | Rule | Points |
|---|---|---|
| R1 Use (10) | The sentence tokens contain the target word or any `allowed_forms` (case-insensitive), or a regular inflection generated by rule. Misspelt target (edit distance 1 for words of ≥ 5 letters) → 5 plus feedback "Check the spelling of *brave*". | 10 / 5 / 0 (gate) |
| R2 Grammar & mechanics (10) | First character uppercase (2). Ends with `.`, `!` or `?` (2). ≥ 80% of tokens found in the basic lexicon (4), ≥ 60% (2). Contains at least one verb from the lexicon's verb list, or the target is itself used as a verb (2). Penalty: any token repeated ≥ 3 times → −2. | 0-10 |
| R3 Relevance (12) | ≥ 1 of the word's `context_words` present (lemmatised) → 12. Otherwise, if the target sits in a plausible POS slot (e.g., an adjective directly before a noun-list word, or after "is/was/very"; a verb after a pronoun or noun) → 8 with `low_confidence`. Otherwise 6 with `low_confidence` (benefit of the doubt; teacher queue). Copied → 0. | 12 / 8 / 6 / 0 |
| R4 Length & complexity (8) | Tokens (excluding punctuation): < 4 → 0, 4-5 → 2, 6-8 → 4, ≥ 9 → 6. +2 if it contains a conjunction or relative word (*and, but, because, so, when, while, if, which, who, that*) **and** ≥ 6 tokens. Cap 8. | 0-8 |

**Known limitation (state it in the research paper):** R3 is a heuristic. Keyword stuffing ("brave soldier brave") is partly blocked by the repetition penalty and the lexicon ratio but not eliminated. The teacher review sample and the κ report make this transparent.

---

## 9. Error Taxonomy

### 9.1 Spelling error categories (multi-label per attempt; one "primary" tag for the dashboards)

| Code | Category | Definition | Example (target → attempt) |
|---|---|---|---|
| `SP_CORRECT` | Correct | Exact match, ignoring case | brave → Brave |
| `SP_PHONETIC` | Phonetically plausible | Sounds the same under simplified Metaphone + Indian-English rules | enormous → enormus, festival → festivel |
| `SP_SILENT` | Silent letter omission | A silent letter is missing (wh, kn, wr, -mb, -gh, -e) | whisper → wisper, knife → nife |
| `SP_DOUBLE` | Double-letter error | A consonant pair is doubled or undoubled | borrow → borow, collect → colect |
| `SP_VOWEL` | Vowel substitution | Only vowels differ | journey → jurney, honest → honist |
| `SP_OMISSION` | Missing letter(s) | Other deletions | protect → protet |
| `SP_INSERTION` | Extra letter(s) | Other insertions | gentle → gentlle |
| `SP_TRANSPOSE` | Swapped letters | Adjacent transposition | ancient → anceint |
| `SP_SUBST` | Consonant substitution | Non-phonetic consonant swap | shelter → shelder |
| `SP_HOMOPHONE` | Homophone | The attempt is a real word that sounds identical | their → there, write → right |
| `SP_REALWORD` | Other real word | A real but different word | brave → brake |
| `SP_L1` | Mother-tongue transfer | Known Marathi/Hindi-influenced swaps (v↔w, s↔sh, z↔j, ph↔f, dropped schwa) | very → wery, zoo → joo |
| `SP_FARMISS` | Far miss | Edit distance > 50% of the length | cheerful → chrl |
| `SP_BLANK` | No attempt | Empty or a single letter | - |

Priority for the primary tag: HOMOPHONE > REALWORD > SILENT > DOUBLE > L1 > VOWEL > TRANSPOSE > PHONETIC > OMISSION > INSERTION > SUBST > FARMISS.

### 9.2 Meaning error categories

| Code | Definition |
|---|---|
| `MN_WRONG_1` | Correct on the second try |
| `MN_WRONG_2` | Wrong both times |
| `MN_DISTRACTOR_TYPE` | Which distractor was chosen (`similar_sound`, `opposite`, `related_topic`), from the word's distractor metadata. Reveals confusion patterns (e.g., confusing antonyms). |

### 9.3 Sentence error categories (derived from the rubric and flags)

| Code | Trigger | Teacher-facing label |
|---|---|---|
| `SN_WORD_MISSING` | R1 gate failed | "Forgets to use the word" |
| `SN_WORD_MISSPELT` | R1 = 5 | "Misspells the word in sentences" |
| `SN_WRONG_FORM` | Target present but in an implausible POS slot | "Wrong word form / usage" |
| `SN_CAPITAL` | R2 capital = 0 | "Capital letters" |
| `SN_PUNCT` | R2 end punctuation = 0 | "Full stops" |
| `SN_NON_ENGLISH` | Lexicon ratio < 60% or Devanagari | "Non-English words" |
| `SN_NO_VERB` | No verb detected | "Incomplete sentence (no verb)" |
| `SN_IRRELEVANT` | R3 ≤ 6, or teacher-set R3 ≤ 4 | "Meaning not clear" |
| `SN_TOO_SHORT` | R4 = 0 | "Very short sentences" |
| `SN_SIMPLE_ONLY` | R4 never earns the conjunction bonus over 10 sentences | "Ready for joining words (and/because)" |
| `SN_COPIED` | Copy detector | "Copies example sentences" |
| `SN_FLAGGED` | Moderation | "Needs a conversation" (teacher only) |

**Dashboard rollup:** each student gets two headline scores, **Spelling Strength** (first-attempt accuracy, 0-100) and **Sentence Strength** (mean rubric %, 0-100), plus their top 2 weakness labels.

---

## 10. Data Model

PostgreSQL (Supabase). `uuid` primary keys. `created_at`/`updated_at` on all tables (omitted below). Pseudonymous research IDs are derived, never stored as names.

| Entity | Key fields | Notes |
|---|---|---|
| **school** | id, name, district, udise_code?, medium (`marathi`/`semi_english`/`english`) | Seeded by the research team |
| **teacher** | id (= auth.users.id), school_id, display_name, email, role (`teacher`/`researcher`) | Allowlisted signup |
| **class** | id, school_id, teacher_id, name ("5B"), academic_year, class_code (unique, 6 chars), leaderboard_mode (`individual`/`class_goal`/`hidden`), notify_time, research_group (`treatment`/`control`/`none`), timezone ('Asia/Kolkata') | |
| **student** | id, class_id, roll_no, first_name, avatar_id, pin_hash, pin_salt, gloss_lang (`mr`/`hi`/`none`), consent_status (`pending`/`received`/`withdrawn`), consent_date, consent_doc_path?, active (bool) | **No DOB, surname, phone, address** (data minimisation) |
| **calendar_day** | class_id, date, type (`school`/`holiday`/`exam`/`weekend`) | Drives streaks and generation |
| **word** | id, text, pos, difficulty (1-3), theme, meaning_en, example_en, gloss_mr, gloss_hi, allowed_forms (text[]), context_words (text[]), distractors (jsonb: [{text, type}]), usage_distractor_sentences (jsonb), sentence_starter, emoji/image_path, source (`bank`/`teacher`/`ai_suggested`), created_by, audio_status (`pending`/`ready`/`failed`), audio_paths (jsonb) | Shared bank + teacher custom words |
| **daily_set** | id, class_id, date, status (`draft`/`approved`), generated_by (`manual`/`auto`), approved_at | Unique (class_id, date) |
| **daily_set_word** | daily_set_id, word_id, position (1-5) | |
| **session** | id, student_id, daily_set_id, mode (`today`/`catch_up`/`practice`), started_at, completed_at, device_id, client_version, scoring_config_version, total_marks, xp_awarded | Unique (student, set, mode=`today`) |
| **attempt** | id (client uuid), session_id, word_id, stage (`spell`/`meaning`/`review`), attempt_no, input_text, is_correct, hints (text[]), error_tags (text[]), primary_error, ms_elapsed, audio_fallback, offline (bool), client_ts, server_ts | Core research log |
| **sentence_submission** | id, session_id, word_id, submission_no, text, r_use, r_grammar, r_relevance, r_length, total_raw, multiplier, hint_cost, final_marks, flags (text[]), confidence, evaluator_version, moderation_status | |
| **sentence_review** | id, submission_id, teacher_id, r_use, r_grammar, r_relevance, r_length, note, reviewed_at, llm_suggestion (jsonb, Phase 2) | Kept separate for inter-rater analysis |
| **word_score** | session_id, word_id, spelling_marks, meaning_marks, sentence_marks, total, stars | Denormalised for dashboards |
| **review_schedule** | student_id, word_id, box (0-4), next_due_date, last_result, mastered_at? | Leitner |
| **xp_ledger** | id, student_id, date, source (`word`/`completion`/`streak`/`review`/`perfect`/`catch_up`/`override_adj`), amount, ref_id | Append-only |
| **streak_state** | student_id, current, best, shields, last_completed_date | |
| **reward_item** | id, kind (`sticker`/`flower`/`accessory`), rarity, asset_path, name | Static catalogue |
| **student_reward** | student_id, reward_item_id, earned_at, source (`chest`/`level`) | |
| **moderation_flag** | id, submission_id, reason (`profanity`/`pii`/`other`), matched_term_hash, status (`open`/`resolved`) | |
| **assessment_score** | id, student_id, test (`pre`/`post`/`delay7`/`delay14`), word_id?, component (`spell`/`meaning`/`sentence`), score, rater_id? | Imported paper tests |
| **audit_log** | id, actor_id, action, entity, entity_id, diff (jsonb), at | Teacher edits, overrides, exports |

**Derived views:** `v_student_error_profile`, `v_class_heatmap`, `v_weekly_leaderboard`, `v_most_improved`, `v_completion_grid`, `v_word_difficulty`.

**Retention policy:** delete or anonymise all student data within 6 months after the research ends or on consent withdrawal (the research export retains only pseudonymous data, per the consent form).

---

## 11. Tech Stack and Architecture

### 11.1 Recommended stack (decisive)

| Layer | Choice | Why |
|---|---|---|
| Client | **React 18 + Vite + TypeScript, as a PWA** (`vite-plugin-pwa`/Workbox) | No app store, installable on Android home screens, one codebase for student and teacher, small bundles. **Not Next.js**: server rendering adds no value for an offline-first, logged-in app and complicates the service worker. |
| Styling | Tailwind CSS | Small CSS output, design tokens, fast agent iteration |
| Local data | **Dexie (IndexedDB)** | Offline outbox, session state, day packs |
| State machine | Small reducer (or XState if the team prefers) | Predictable stage flow and resume |
| Backend | **Supabase**, project in the **Mumbai (ap-south-1) region** | Postgres (relational analytics + SQL views + easy CSV research exports), Auth, Row Level Security, Storage for audio, Edge Functions for student login, scoring verification and export. Free or low tier is enough for the pilot. Data stays in India. |
| Why not Firebase | Firestore makes cross-student aggregations (heatmaps, leaderboards, research CSVs) awkward and costly. There is no SQL for researchers. | |
| Why not Node + SQLite | It needs a team to host, patch, back up and secure a server for a student project, plus building auth. Supabase gives this managed. | |
| Audio | **Pre-generated neural TTS** (en-IN voice), Opus 24 kbps, stored in Supabase Storage, cached by the service worker; Web Speech API only as a fallback | See 11.3 |
| Push | Web Push (VAPID) via a Supabase Edge Function + cron | Optional, parent opt-in |
| Testing | Vitest (core), Playwright (E2E incl. offline), Supabase local CLI for RLS tests | |
| Hosting | Static hosting (Vercel/Netlify/Cloudflare Pages) with an Indian edge PoP | Free tier, global CDN, HTTPS needed for PWA |
| Monitoring | Sentry (free tier) with PII scrubbing; no third-party analytics SDKs | DPDP; analytics come from our own attempt logs |

### 11.2 Architecture

```
 ┌────────────────────────── Student / Teacher Device (Android Chrome) ──────────────────────────┐
 │  React PWA                                                                                     │
 │   ├─ UI (student flow, teacher dashboard)                                                       │
 │   ├─ packages/core  (scoring, spelling classifier, sentence evaluator, generator)  ← pure TS     │
 │   ├─ Dexie/IndexedDB: session state, outbox, day pack metadata, remembered students             │
 │   └─ Service Worker (Workbox): app shell, audio cache, background sync                          │
 └───────────────┬───────────────────────────────────────────────────────────────────────────────┘
                 │ HTTPS (JWT: teacher = Supabase Auth; student = custom JWT from edge fn)
 ┌───────────────▼─────────────────────────── Supabase (Mumbai) ─────────────────────────────────┐
 │ Edge Functions: student-login · submit-session (re-score w/ same core lib) · generate-audio     │
 │                 research-export · push-cron · (Phase 2) llm-suggest                              │
 │ Postgres + RLS: tables (§10) + analytics views                                                 │
 │ Storage: audio/ (public-read, unguessable paths) · consent/ (private, teacher-only)            │
 └───────────────┬───────────────────────────────────────────────────────────────────────────────┘
                 │ build-time / on-demand
          ┌──────▼──────┐
          │ Cloud TTS   │  (en-IN / mr-IN voices; called only by script / edge fn, never by client)
          └─────────────┘
```

**Key architecture rule:** `packages/core` runs **both** on the client (instant offline feedback) and in the `submit-session` edge function (Deno, authoritative re-score). Same code, same version, so no scoring drift.

### 11.3 Audio decision: pre-generated TTS, not the Web Speech API

| | Web Speech API (`speechSynthesis`) | Pre-generated TTS files |
|---|---|---|
| Offline | Depends on installed voices; many low-end Android phones have **no en-IN voice offline** | ✅ cached files |
| Consistency | Voice, accent and speed vary by device (bad for research validity) | ✅ identical for every child |
| Quality | Often robotic; can mispronounce | ✅ neural voice; the team can listen and approve every word |
| Cost | Free | One-time: 150 words × 4 clips ≈ a negligible cost; files ≈ 5-25 KB each |
| Verdict | **Fallback only** | **Primary** |

**Content QA:** a B.Ed team member listens to every generated clip in an "audio review" checklist before a word is marked `ready`. Where TTS is poor, a human recording can be uploaded to the same path.

### 11.4 Bandwidth budget

- First load (app shell): ≤ 250 KB gzipped JS+CSS, ≤ 150 KB fonts and icons (system fonts preferred; Noto Sans Devanagari subset only for glosses).
- Daily pack: 7 words × (word + slow + meaning + example) ≈ **≤ 400 KB/day**, about 8 MB/month. Acceptable on a ₹199/month data plan.
- Lab or shared-device mode: the teacher can tap "Download this week" on Wi-Fi to pre-cache 5 days.

---

## 12. UX Principles for 10-Year-Olds

1. **One screen, one task, one big button.** Primary buttons are ≥ 56 px tall and full-width on phones. Gaps between targets are ≥ 8 px.
2. **Icons + audio before text.** Every instruction has an icon and a 🔊 to read it aloud. The UI uses at most 6 words per instruction, at Standard 3 reading level.
3. **Bilingual help, not a bilingual UI.** English is the learning language. A visible **"मराठी / हिंदी"** chip shows the gloss and an audio explanation in the mother tongue. It is never forced.
4. **Predictable rhythm.** The same 3 stages always appear in the same order with the same colours (🔵 Listen, 🟢 Learn, 🟣 Write). A progress caterpillar at the top has 5 segments × 3 dots.
5. **Kind feedback.** Wrong answers get a soft wobble and "Almost! Try again 💪", never a red ✗ buzzer. Correct answers get a short confetti burst and a varied phrase. All animations are ≤ 1 s and respect `prefers-reduced-motion`.
6. **Custom keyboard for spelling.** It removes autocorrect cheating, gives larger keys, and the QWERTY layout builds keyboard familiarity. Lowercase only.
7. **No time pressure.** No timers in any stage (the time is logged silently for research).
8. **A mascot as guide.** A friendly character ("Mitra" the parrot 🦜; parrots "repeat words", which is culturally familiar) appears on the empty, praise and help states.
9. **Typography.** Base 18 px, word display 40 px+, a high-legibility sans-serif (Atkinson Hyperlegible or the system font), left-aligned, line height 1.5.
10. **Accessibility.** WCAG 2.1 AA contrast. Never rely on colour alone (green letters also get a ✓ underline). Screen-reader labels on all icon buttons. Captions shown alongside audio. Support for 200% text zoom without loss of function.
11. **Shared-device friendly.** Prominent "Not you? Switch" avatar control. Auto-logout after 15 minutes of inactivity in lab mode.
12. **Teacher UI is a separate visual mode**: denser, plain and table-friendly. It is reached via a teacher login link that never appears on the student home screen.

---

## 13. Non-Functional Requirements

### 13.1 Offline
- NFR-O1: After the day pack loads once, the full session (all stages, audio, scoring feedback) works with no network.
- NFR-O2: Zero data loss across app kill, refresh or reboot (IndexedDB persistence after every step).
- NFR-O3: Sync is automatic and idempotent. Offline data older than 7 days is still accepted (timestamp validated, flagged `offline`).

### 13.2 Performance (reference device: 2 GB RAM Android Go, Chrome, slow 3G)
- NFR-P1: First load Time-to-Interactive ≤ 5 s on slow 3G. Repeat load ≤ 1.5 s (cached shell).
- NFR-P2: Stage transitions ≤ 300 ms. Rule evaluation ≤ 50 ms. Audio starts ≤ 200 ms after a tap (cached).
- NFR-P3: JS bundle ≤ 250 KB gzipped initial. Teacher dashboard is code-split.
- NFR-P4: Supports 500 concurrent students (≫ pilot) on the Supabase base tier.

### 13.3 Compatibility
- Android Chrome 90+ (primary), Samsung Internet, desktop Chrome/Edge (teacher, lab), iOS Safari 16+ (best effort; push not required). Screen widths 320 px-1440 px.

### 13.4 Privacy and legal (DPDP Act 2023 + Rules 2025)
- NFR-PR1: **Verifiable parental consent** before processing. MVP mechanism: a school-distributed bilingual (Marathi/English) consent form signed by the parent, collected by the teacher, with the teacher attesting in the app and optionally uploading a scan. The research ethics approval references the same form. *(Confirm with advisor: Q3.)*
- NFR-PR2: Data minimisation: first name, roll number, class, avatar, learning data. No DOB, phone, address, photos, or location.
- NFR-PR3: Purpose limitation: educational feedback and approved research only. No advertising or profiling.
- NFR-PR4: Data stored in India (Supabase Mumbai). Encryption in transit (TLS) and at rest (provider default). Consent scans go to a private bucket.
- NFR-PR5: Rights: the teacher can export or delete a student's data on parental request (withdrawal → `consent_status=withdrawn` → data deleted within 30 days, except pseudonymous research rows if the consent form permits).
- NFR-PR6: Research exports are pseudonymised (HMAC). The re-identification key is held only by the teacher.
- NFR-PR7: No third-party trackers or analytics SDKs. Sentry with `sendDefaultPii=false` and input text scrubbing.
- NFR-PR8: A child-friendly privacy notice (icons) for students and a full notice for parents (in Marathi and English).

### 13.5 Security
- RLS on every table, with automated RLS tests in CI. Student JWTs are scoped to `student_id`. PIN brute-force lockout. The service-role key is used only inside edge functions. The audit log records all teacher overrides and exports. Dependency scanning (GitHub Dependabot).

### 13.6 Safety and content moderation of child-written sentences
- NFR-S1: **No student-generated content is ever shown to other students.** This alone removes most risk.
- NFR-S2: Client and server blocklists (English + transliterated Marathi/Hindi abuse terms), PII detectors (phone, email, address phrases).
- NFR-S3: Flagged sentences are excluded from scoring and queued to the teacher. Repeated flags are highlighted. There are no automatic punishments.
- NFR-S4: **Safeguarding escalation:** if a sentence suggests harm or abuse (keyword list: "beat me", "hurt me", "touch me", and similar in the three languages), it is flagged `safeguarding` with a dashboard banner advising the teacher to follow the school's child-protection procedure. The app does not attempt to triage it.
- NFR-S5: Teacher-entered custom words and AI-suggested words go through the same blocklist and need approval.

### 13.7 Reliability and maintainability
- 99% availability during school hours is sufficient (offline mode covers gaps). Daily automated Postgres backups (provider). Scoring and evaluator versions are stored on every row. Feature flags for the leaderboard mode, push and LLM.

---

## 14. Success Metrics

### 14.1 Learning outcomes (primary; from the research design)
| Metric | Target (pilot, 4 weeks) |
|---|---|
| Spelling accuracy gain, taught words, pre → post (treatment) | ≥ +25 percentage points; between-group effect size d ≥ 0.5 |
| Meaning MCQ gain | ≥ +20 pp |
| Sentence rubric mean gain (blind-rated) | ≥ +15 pp |
| Retention: +14-day delayed score / immediate post score | ≥ 70% |
| In-app 7-day review accuracy | ≥ 60%; 14-day ≥ 50% |

### 14.2 Engagement (healthy habit, not addiction)
| Metric | Target |
|---|---|
| Daily participation (students completing today's set / consented students, school days) | ≥ 70% |
| Session completion rate (completed / started) | ≥ 85% |
| Median session duration | 10-15 min (a **ceiling** metric too: p90 ≤ 25 min) |
| Median streak at week 4 | ≥ 8 school days |
| Hint usage | Declines week 1 → week 4 (a signal of growing independence) |
| Retry rate on sentences after feedback | ≥ 40% of eligible (shows that feedback is acted on) |

### 14.3 Teacher and system
| Metric | Target |
|---|---|
| Teacher time to set up a week of words | ≤ 5 min |
| Review queue size | ≤ 20 items/class/day; teacher clears ≥ 80% within 2 days |
| Rule-based vs teacher agreement (κ) on R1, R4 | ≥ 0.80; R2 ≥ 0.6; R3 reported (expected lower) |
| Spelling classifier agreement (primary tag) | ≥ 85% |
| Sync data loss | 0 attempts lost |
| Teacher SUS usability score | ≥ 70 |

---

## 15. Risks and Mitigations

| # | Risk | Likelihood / Impact | Mitigation |
|---|---|---|---|
| R1 | **Device access**: many students have no personal device. A parent's phone is available only in the evenings. | High / High | Decide the usage model early (Q1). Support shared devices (≤ 10 remembered students) and a "lab rotation" mode. Allow the session to be done at school on 5-6 shared tablets in rotation (15 min × 45 students needs planning). Catch-up mode keeps absent students learning. |
| R2 | **Typing ability**: Standard 5 students are slow typists; sentences of 6+ words may take minutes. | High / Med | Custom large keyboard for spelling. Sentence length tiers start at 4 words. No timers. A 2-day in-class "typing warm-up" before the pre-test. Session time is monitored; reduce to 3-4 words per day if the median is > 20 minutes (config flag). |
| R3 | **Native keyboard autocorrect** fixes spelling and inflates scores. | High / High (research validity) | The custom keyboard is mandatory for the spelling stage. For sentences, the `autocorrect=off` attributes are set and accepted as imperfect. Log a `native_keyboard` flag. |
| R4 | **TTS accent or clarity** confuses students (e.g., "whisper" heard as "visper"). | Med / High | en-IN neural voice, human QA of every clip, slow replay, human re-recording option. |
| R5 | **Copying the example sentence** or gaming with keyword stuffing. | High / Med | Copy detector, repetition penalty, teacher sample review, R3 benefit-of-doubt capped at 6. |
| R6 | **Leaderboard demotivates weaker students.** | Med / Med | XP weighted toward completion and streaks, Most Improved board, top 10 only, weekly reset, teacher toggle. |
| R7 | **Consent and ethics delays** stop the pilot start. | Med / High | Start the ethics application and consent form in Week 0, in parallel with the build. The app gates on consent, so data collection is never non-compliant. |
| R8 | **Rule-based sentence scoring is seen as unfair** by teachers or Avishkar judges. | Med / Med | Present it as "instant formative feedback + teacher verification". Report κ. Use blind human raters for the research outcome measure (the in-app score is not the outcome). |
| R9 | **Novelty or Hawthorne effects** inflate the results. | Med / Med (research) | 4-week duration, delayed post-tests, control words, a control division, and acknowledging limitations. |
| R10 | **Teacher workload** (word approval, review queue). | Med / High | Auto-fill week, 10% sample queue, bulk approve, a phone-friendly dashboard. Target ≤ 10 minutes/day in total. |
| R11 | **Connectivity** prevents the first daily download. | Med / Med | Pre-cache tomorrow plus "Download this week" on Wi-Fi. Small packs. Web Speech fallback. |
| R12 | **Scope creep / agent integration conflicts** in the parallel build. | Med / Med | F2 types are the contract and merge first. Pure logic in `packages/core`. Strict PR-per-feature. An integration agent owns F8 wiring. |
| R13 | **Inappropriate or safeguarding content** in sentences. | Low / High | NFR-S1-S4. |
| R14 | **DPDP interpretation** of "behavioural monitoring" covering learning analytics. | Low / High | Educational-purpose scoping, advisor or legal confirmation (Q3), no non-educational use, a teacher-only view. |

---

## 16. Open Questions (Decision-Blocking)

Only questions that block design or build decisions are listed. Each has a **default** the team will build toward if it is not answered by the end of Week 0.

| # | Question | Why it blocks | Default if unanswered |
|---|---|---|---|
| **Q1** | **Where and on what devices will students do the daily session**: school lab or shared tablets in class time, parents' phones at home, or both? | Drives the auth model (shared device), offline strategy, the notification trigger, the streak definition and the research protocol (controlled vs uncontrolled exposure). | **Both**: primary in school on shared devices; optional home use. Build the shared-device support in F3. |
| **Q2** | **How many divisions and schools are in the pilot, is a control division available, and what is the Avishkar submission deadline?** | Determines the research design (between-group vs within-subject only), the 4-week window and therefore the build deadline. | 1 school, 2 divisions (1 treatment, 1 control), 4-week intervention, build-complete 3 weeks before the intervention starts. |
| **Q3** | **Consent and ethics pathway:** has the university ethics committee or faculty advisor confirmed that (a) school-collected paper parental consent satisfies DPDP verifiable consent for this research, and (b) per-student learning analytics fall within the educational exemption? | Without it the pilot cannot legally collect data, and F3 and F22 details depend on it. | Paper consent + teacher attestation (as specified). Analytics are teacher-only. |
| **Q4** | **Word source:** must the words come from the Balbharati Standard 5 English textbook ("My English Book"), or can the team curate a broader age-appropriate list? Who on the B.Ed team owns writing the 150-word bank (meanings, examples, glosses, distractors, context words)? | The content is on the critical path for F2 seed and F7 audio. Textbook alignment affects teacher buy-in and research framing. | 60% textbook-aligned + 40% high-frequency Standard 4-6 words. One content owner, with 150 words delivered as CSV by the end of Week 1. |
| **Q5** | **Is sending children's sentences to an external LLM provider acceptable at all** (even in Phase 2, PII-scrubbed)? | Decides whether F23 is ever built and what the consent form must say *now*. | Not in the pilot. The consent form includes optional wording for a future LLM-assisted phase, so a later consent round is not needed. |

---

## 17. Phased Roadmap and Task Breakdown

### 17.1 Phases

| Phase | Timing | Outcome |
|---|---|---|
| **Phase 0: Decisions and content** | Week 0 | Answers to Q1-Q5, ethics application filed, consent form drafted, content owner starts the 150-word CSV and 200 spelling-error / 100 sentence labelled fixtures |
| **Phase 1: Foundation** | Week 1 (days 1-2) | F1, F2 merged (the contract) |
| **Phase 2: Parallel build** | Week 1-2 | Waves 1-2: auth, roster, word sets, audio, all core logic, student stages |
| **Phase 3: Gamification and teacher insight** | Week 2-3 | Wave 3: XP/streak/chest, leaderboard, sync, moderation, review, dashboards, analytics, export |
| **Phase 4: Hardening and pilot readiness** | Week 3 (end) | Device testing on 3 low-end Android phones, offline E2E, teacher usability test (2 teachers), 5-student think-aloud, audio QA of all 150 words, dry run with a non-pilot class for 3 days |
| **Phase 5: Pilot and research** | Weeks 4-9 | Pre-test → 4-week intervention → post-test → +7 and +14 delayed tests → analysis and Avishkar paper and poster |
| **Phase 6: Post-MVP** | After Avishkar | F23 LLM suggestions, F24 AI word suggestions, F25 parent summary, F26 Marathi UI and more standards |

### 17.2 Task breakdown (for parallel Sonnet agents)

Sizes: S ≈ 0.5 day, M ≈ 1 day, L ≈ 2 days (agent effort, including tests). **Agent lanes** keep file ownership separate to minimise merge conflicts:
- **Lane A: Platform/Backend** (`supabase/`, edge functions, auth, sync)
- **Lane B: Core Logic** (`packages/core`, pure TS + tests only)
- **Lane C: Student UI** (`apps/web/src/student`)
- **Lane D: Teacher UI** (`apps/web/src/teacher`)
- **Lane E: Content/Audio** (scripts, seed data, audio pipeline)

| ID | Feature | Size | Depends on | Wave | Lane | Can run in parallel with |
|---|---|---|---|---|---|---|
| F1 | Scaffold, CI, PWA, design tokens, i18n | M | - | 0 | A | (content work) |
| F2 | Schema, RLS, shared types, seed | L | F1 | 0 | A | F9, F10, F13 can start on draft types |
| F3 | Auth (teacher + student PIN) + consent gate | L | F2 | 1 | A | F4-F7, F9-F13 |
| F4 | Class & roster mgmt, login cards, calendar | M | F2, F3 (teacher auth) | 1 | D | F5, F7 |
| F5 | Word bank browser + manual set editor | M | F2 | 1 | D | F4, F6 |
| F6 | Auto-generate week (core fn + UI) | S | F2, F5 (UI part) | 1 | B → D | F5 |
| F7 | Audio pipeline + offline audio cache | M | F2 | 1 | E | all Wave 1 |
| F9 | Scoring engine | S | F2 types | 1-2 | B | everything |
| F10 | Spelling error classifier | M | F2 types, fixtures | 1-2 | B | everything |
| F13 | Rule-based sentence evaluator | M | F2 types, lexicon, fixtures | 1-2 | B | everything |
| F8 | Student home + session state machine | M | F3 | 2 | C | F11-F14 (stubs) |
| F11 | Stage 1 Listen & Spell UI | M | F7, F8, F9, F10 | 2 | C | F12 |
| F12 | Stage 2 Learn & Check UI | S | F8, F9 | 2 | C | F11 |
| F14 | Stage 3 Sentence UI + summary | M | F8, F9, F13 | 2 | C | F11, F12 |
| F17 | Offline sync engine + `submit-session` re-score | M | F3, F8, F9 | 3 | A | F15, F16, F18 |
| F15 | Gamification (XP, streak, shields, chest, garden, push) | M | F9, F14, F17 | 3 | C | F16, F20 |
| F16 | Leaderboard + modes | S | F15 (ledger) | 3 | C/D | F20, F21 |
| F18 | Content moderation | S | F13, F17 | 3 | B + A | F15 |
| F19 | Spaced review + retention probe | M | F8, F11, F17 | 3 | B + C | F20 |
| F20 | Teacher dashboard: grid, detail, review queue, Word Star | L | F17, F14 | 3 | D | F21 |
| F21 | Weakness analytics views + UI | M | F10, F13, F17 | 3 | D (+A for SQL views) | F20 |
| F22 | Research export + group tagging + test score import | S | F17 | 3 | A | F20, F21 |
| QA | Device matrix, offline E2E, a11y audit, Lighthouse | M | all | 4 | any | - |

**Critical path:** F1 → F2 → F3 → F8 → F11/F14 → F17 → F15 → QA (≈ 9-10 agent-days sequential). Lanes B, D and E fill in alongside it. With 4-5 parallel agents, the MVP is realistic in **about 2.5-3 calendar weeks**, including review and fixes.

**PR rules for agents:**
1. One feature ID per branch: `feat/F11-listen-spell`. The PR title is prefixed with the ID.
2. Do not edit another lane's directories except through a coordinated "contract" PR to `packages/core/src/types` (owned by Lane A/B lead).
3. Every PR has tests. Core logic needs ≥ 90% line coverage. UI features need ≥ 1 Playwright happy path.
4. Use feature flags for incomplete UI so `main` always deploys.

---

## Appendix A: Seed Word List Sample

Fifteen of the planned 150 words. Difficulty: 1 easy, 2 medium, 3 hard (for Standard 5 English as L2). Context words feed R3 relevance scoring.

| # | Word | POS | Diff | Simple meaning | Example sentence | Marathi gloss | Context words (R3) |
|---|---|---|---|---|---|---|---|
| 1 | brave | adj | 1 | Not afraid to do something difficult or dangerous | The brave girl saved the puppy from the river. | शूर | soldier, fight, save, fear, lion, hero |
| 2 | gentle | adj | 1 | Soft, kind and careful | Be gentle when you hold the baby bird. | सौम्य, हळुवार | kind, soft, touch, baby, voice, careful |
| 3 | honest | adj | 1 | Telling the truth; not cheating | Ravi was honest and returned the lost wallet. | प्रामाणिक | truth, lie, return, cheat, trust |
| 4 | festival | noun | 1 | A special day when people celebrate together | Diwali is my favourite festival. | सण, उत्सव | Diwali, Ganpati, celebrate, lights, sweets, Eid, Christmas |
| 5 | collect | verb | 1 | To bring things together in one place | I collect shells at the beach. | गोळा करणे | stamps, shells, money, books, gather |
| 6 | cheerful | adj | 2 | Happy and full of good feelings | Our cheerful teacher always smiles at us. | आनंदी, प्रसन्न | smile, happy, morning, laugh, mood |
| 7 | journey | noun | 2 | Travelling from one place to another | Our train journey to Pune took three hours. | प्रवास | train, bus, travel, trip, long, village |
| 8 | borrow | verb | 2 | To take something and give it back later | Can I borrow your pencil, please? | उसने घेणे | pencil, book, return, friend, money, library |
| 9 | protect | verb | 2 | To keep someone or something safe | Trees protect us from the hot sun. | रक्षण करणे | safe, danger, guard, mother, helmet, save |
| 10 | shelter | noun | 2 | A place that keeps you safe from rain, sun or danger | The farmer took shelter under a tree during the rain. | निवारा, आसरा | rain, storm, home, roof, animals, tree |
| 11 | harvest | noun/verb | 2 | Collecting crops from the fields when they are ready | The farmers are happy because the harvest is good. | सुगी, पीक कापणी | farmer, crop, field, rice, wheat, season |
| 12 | curious | adj | 3 | Wanting to know or learn about something | The curious boy asked many questions about the stars. | जिज्ञासू, उत्सुक | question, know, learn, wonder, explore |
| 13 | enormous | adj | 3 | Very, very big | An elephant is an enormous animal. | प्रचंड, खूप मोठा | elephant, huge, big, building, whale, mountain |
| 14 | whisper | verb/noun | 3 | To speak very softly and quietly | She whispered a secret in my ear. | कुजबुजणे | secret, ear, quiet, softly, friend |
| 15 | ancient | adj | 3 | Very, very old; from long ago | We visited the ancient caves at Ajanta. | प्राचीन, पुरातन | old, caves, fort, temple, history, kings |

**Spelling-teaching value of this set:** silent letters (*whisper*), double letters (*borrow, collect*), vowel ambiguity (*journey, curious, enormous*), the *-ci-* /ʃ/ sound (*ancient*), and the *-tect / -ter* endings, which gives the error classifier varied signal.

**Distractor example for "brave"** (meaning check): ✅ "Not afraid to do something difficult" · ✗ "Very afraid and nervous" (`opposite`) · ✗ "Very tired after work" (`related_topic`).

---

## Appendix B: Critical Review of the Original Brief

Where this PRD deliberately departs from or tightens the brief, and why:

1. **"Meaning is shown" cannot be scored as-is.** Showing a meaning measures nothing. We added a **3-option meaning check** (20 marks) so the "meaning-recall" component is measurable. It is honestly labelled *recognition*. True recall is measured by the next-day spaced review and the paper tests.
2. **Duolingo-style typing on a phone keyboard invalidates spelling data** because of autocorrect and suggestions. We require a **custom in-app keyboard** for Stage 1. This is non-negotiable for research validity.
3. **The brief has no retention mechanism, but the research question needs one.** We added **2 spaced-review warm-up words a day** (F19). It costs about 1 minute and directly produces the 7- and 14-day retention data.
4. **Rule-based sentence scoring is weak on meaning.** Rather than overclaim, the MVP treats in-app sentence scores as *formative*. The research outcome uses **blind human raters**. LLM help is a teacher-facing Phase 2 suggestion.
5. **Hooked + children is an ethical tension.** We reframed the success metric from engagement time to **daily completion within a cap**. Rewards are cosmetic with disclosed odds, and there is no loss-framed messaging.
6. **Leaderboards reward the already strong.** XP is deliberately weighted toward completion and consistency, with a Most Improved board and a teacher-controlled mode.
7. **Shared devices are the norm, not the edge case**, in Maharashtra government and aided schools. Student auth uses a class code + avatar + picture PIN with multi-student devices, not email.
8. **Five words a day with sentence writing may exceed 15 minutes** for slow typists. The words-per-day count is a config value, and the pilot dry run (Phase 4) decides whether the number should be 5 or 4.
