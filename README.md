# Shabd Mitra: 5 new English words a day (MVP)

A mobile-web vocabulary app for Maharashtra State Board **Std 5** students, built for a 200-student pilot on home Android phones. Every day a student learns 5 words in 3 stages:

1. 🔵 **Listen & spell:** speech audio and a custom on-screen keyboard.
2. 🟢 **Learn the meaning:** the meaning, a Marathi gloss and an example, then a 3-option check.
3. 🟣 **Write your own sentence:** also typed on the on-screen keyboard, then scored by rules (optionally with Claude feedback).

Teachers get a roster with PIN login cards, a daily-words editor, a dashboard, a leaderboard and a per-student weakness analysis, plus CSV export.

Product requirements are in `docs/PRD.md`. The MVP build contracts are in `docs/API.md`, `docs/UI_SPEC.md`, `docs/CONTENT_SPEC.md` and `docs/BUILD_PLAN.md`.

## Run it locally

Requires **Node 22+**. No cloud accounts are needed.

```bash
npm install
npm run dev        # server on :4000 (API at /api), web on :5173 (proxies /api)
```

Open http://localhost:5173 for students and http://localhost:5173/teacher for teachers. To test on a phone on the same Wi-Fi, open `http://<your-laptop-ip>:5173`.

Dev seed (`SEED_DEMO=1`, the default): the teacher is `demo@school.test` / `demo1234`, the class code is `DEMO5A`, and every student's PIN is `1234`.

Optional `.env` at the repo root (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | API port |
| `DB_PATH` | `server/data/shabd.db` | SQLite file (`npm run db:reset` deletes it) |
| `ANTHROPIC_API_KEY` | (unset) | Turns on Claude sentence feedback. Without it, the rule-based evaluator is used. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for sentence feedback |
| `TEACHER_INVITE_CODE` | (unset) | When set, teacher sign-up requires this code |
| `SEED_DEMO` | 1 | Seeds the demo teacher, class and students when the DB has no teachers |
| `FAKE_TODAY` | (unset) | `YYYY-MM-DD`; overrides "today" for demos and tests |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API and web with hot reload |
| `npm test` | Vitest in all workspaces |
| `npm run typecheck` | `tsc` in all workspaces |
| `npm run build` | Production PWA build (`apps/web/dist`) |
| `npm run validate:words` | Validates `content/words/part-0*.json` (1830 words). Add `-- --part N` to check one part, or `-- --partial` to see progress. |
| `node scripts/word-owner.mjs <word…>` | Shows which content part owns a word (no-duplicate rule) |

## Layout

```
packages/core   Pure TS: shared types (THE contract), scoring, spelling-error classifier, sentence rules, XP/streak
server          Express 5 + better-sqlite3: schema/migrations, auth, REST API, analytics, CSV, optional Claude evaluator
apps/web        React 19 + Vite PWA: student app (/), teacher app (/teacher, code-split), on-screen keyboard
content/words   part-01.json … part-06.json: 366 days × 5 words
scripts         Content validator and word-owner tools
docs            PRD, API, UI, content specs, build plan
```

## Privacy notes (pilot)

- Students are stored by first name, roll number and avatar only. PINs are 4 digits, kept so they can be reprinted on cards.
- When `ANTHROPIC_API_KEY` is set, only the target word and the child's sentence are sent to the Claude API, with no names or IDs, and only after the local moderation check passes. The school has collected consent for this.
- All data stays in the local SQLite file.

## Optional Claude sentence scoring

Sentence scoring uses local rules by default. Set these environment variables on the server to add Claude scoring:

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude scoring when set. Unset = rules only. |
| `CLAUDE_MODEL` | Model to use. Default `claude-haiku-5-5` (cheap; about 1300 calls/day in the pilot). |

Claude only refines grammar, relevance and length, and adds a short tip. The "word used" score and copy detection always come from the rules. Each call has a 6 second timeout; on any error, timeout, refusal or invalid output the rules result is used, so a child is never blocked. Privacy: only the target word, its part of speech and meaning, and the child's sentence are sent (no names or IDs), and only after the local moderation check passes.
