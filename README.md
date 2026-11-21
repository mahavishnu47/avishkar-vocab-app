# Shabd Mitra: 5 new English words a day (MVP)

A mobile-web vocabulary app for Maharashtra State Board **Std 5** students, built for a 200-student pilot on home Android phones. Every day a student learns 5 words in 3 stages:

1. 🔵 **Listen & spell:** speech audio and a custom on-screen keyboard.
2. 🟢 **Learn the meaning:** the meaning, a Marathi gloss and an example, then a 3-option check.
3. 🟣 **Write your own sentence:** also typed on the on-screen keyboard, then scored by rules (optionally with Claude feedback).

Schools are onboarded by invitation (super admin → principal → teachers → classes → students, see `docs/ONBOARDING_SPEC.md`). Teachers get a roster with PIN login cards, a daily-words editor, a dashboard, a leaderboard and a per-student weakness analysis, plus CSV export.

Product requirements are in `docs/PRD.md`. The MVP build contracts are in `docs/API.md`, `docs/UI_SPEC.md`, `docs/CONTENT_SPEC.md` and `docs/BUILD_PLAN.md`.

## Run it locally

Requires **Node 22+** and a **PostgreSQL 16** database (the same database engine as production).

```bash
# 1. A local Postgres, either with Docker...
docker run -d --name shabd-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
# ...or without Docker (uses the system initdb/pg_ctl, port 54329):
#   node scripts/pg-local.mjs start      (prints the DATABASE_URL to use)

# 2. Install and run
npm install
npm run dev        # server on :4000 (API at /api), web on :5173 (proxies /api)
```

`npm run dev` creates the local database if it is missing, then the tables, loads the word bank and seeds the demo data by itself. If `DATABASE_URL` is not set it uses `postgres://postgres:postgres@localhost:5432/shabd` (the Docker command above).

Open http://localhost:5173 (landing page with Student, Teacher and School tiles). Teachers use http://localhost:5173/teacher, school admins `/school`, the platform owner `/admin`. To test on a phone on the same Wi-Fi, open `http://<your-laptop-ip>:5173`.

Dev seed (`SEED_DEMO=1`, the default): school "Demo School", the school admin and teacher is `demo@school.test` / `demo1234`, the class code is `DEMO5A` (student link `/j/DEMO5A`), the teacher invite is `TEAC-HERS` (`/t/TEACHERS`), the school student link is `/s/DEMSCH`, and every student's PIN is `1234`.

Optional `.env` at the repo root (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/shabd` | Postgres connection string. In production: the Neon **pooled** URL. |
| `DATABASE_URL_UNPOOLED` | (unset) | Neon direct URL; `db:migrate`/`db:seed` prefer it when set |
| `PGPOOL_MAX` | 3 (Neon) / 10 (local) | Connections per server instance |
| `PORT` | 4000 | API port (local only) |
| `ANTHROPIC_API_KEY` | (unset) | Turns on Claude sentence feedback. Without it, the rule-based evaluator is used. |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | Model for sentence feedback |
| `SUPER_ADMIN_SECRET` | (unset) | Turns on `/admin` and `/api/admin/*` (create schools). At least 16 random characters. Unset = feature off. **Set it in production.** |
| `PUBLIC_APP_URL` | (from request headers) | Absolute app URL used in share links, e.g. `https://shabd-mitra.vercel.app`. **Required in production.** |
| `VITE_CONTACT_TEXT` | (unset) | Optional "New school? ..." contact line on the landing page (build time) |
| `SEED_DEMO` | 1 | Local dev only: seeds the demo teacher, class and students |
| `FAKE_TODAY` | (unset) | `YYYY-MM-DD`; overrides "today" for demos and tests. Ignored on Vercel production. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API and web with hot reload (migrates and seeds first) |
| `npm test` | Vitest in all workspaces (uses a throwaway local Postgres, or `TEST_DATABASE_URL`) |
| `npm run typecheck` | `tsc` in all workspaces |
| `npm run build` | Production PWA build (`apps/web/dist`) |
| `npm run vercel-build` | What Vercel runs: PWA build plus the bundled API (`server/dist/handler.mjs`) |
| `npm run db:migrate` | Creates or updates the tables in `DATABASE_URL` (safe to re-run) |
| `npm run db:seed` | Loads the 1830-word bank (safe to re-run) |
| `npm run db:seed:demo` | Adds the demo teacher, class and students (refuses in production) |
| `npm run e2e` | Browser end-to-end test on a fresh throwaway database |
| `npm run e2e:onboarding` | Full onboarding journey (super admin, principal, teacher, students) at 320x640 and 412x915 on a fresh database |
| `npm run check:bundle` | Fails if the student bundle is over 150 KB gzipped or contains the QR library (run `npm run build` first) |
| `npm run admin -- create-school --name "ZP School Kalwa"` | Super admin CLI: creates a school and prints its one-time setup link (`list`, `setup-link --school <id>` also available) |
| `npm run e2e:prod` | Same, against the built bundle served the way Vercel serves it |
| `npm run validate:words` | Validates `content/words/part-0*.json` (1830 words). Add `-- --part N` to check one part, or `-- --partial` to see progress. |
| `node scripts/word-owner.mjs <word...>` | Shows which content part owns a word (no-duplicate rule) |

## Deploy (Vercel + Neon)

The app runs on Vercel (static PWA plus one serverless API function) with a free hosted Postgres from Neon. The full click-by-click guide, written for non-experts, is in **[docs/DEPLOY.md](docs/DEPLOY.md)**. In short:

1. Create a Neon project (Singapore region) and copy its connection strings.
2. From your laptop: `DATABASE_URL='<direct url>' npm run db:migrate` then `DATABASE_URL='<direct url>' npm run db:seed`.
3. Import the GitHub repo in Vercel, set `DATABASE_URL` (pooled URL), `SUPER_ADMIN_SECRET` and `PUBLIC_APP_URL`, and deploy.
4. Open `https://<your-app>.vercel.app/api/health`; it should answer `{"ok":true,"db":"ok","words":1830}`.
5. Open `/admin`, enter the secret and create the first school. Send the setup link to the principal. Schools are by invitation only; see **[docs/ONBOARDING_GUIDE.md](docs/ONBOARDING_GUIDE.md)** for the one-page guide for principals, teachers and students.

## Layout

```
packages/core   Pure TS: shared types (THE contract), scoring, spelling-error classifier, sentence rules, XP/streak
server          Express 5 + Postgres (pg): schema/migrations, auth, REST API, analytics, CSV, optional Claude evaluator
apps/web        React 19 + Vite PWA: student app (/), teacher app (/teacher, code-split), on-screen keyboard
content/words   part-01.json … part-06.json: 366 days × 5 words
scripts         Content validator, word-owner tool, Vercel API bundler, local Postgres and prod-like server
api             Vercel function entry (re-exports the bundled server)
docs            PRD, API, UI, content specs, build plan
```

## Privacy notes (pilot)

- Students are stored by first name, roll number and avatar only. PINs are 4 digits, kept so they can be reprinted on cards.
- When `ANTHROPIC_API_KEY` is set, only the target word and the child's sentence are sent to the Claude API, with no names or IDs, and only after the local moderation check passes. The school has collected consent for this.
- All data is stored in your own Postgres database (Neon in production). Keep the connection string secret.

## Optional Claude sentence scoring

Sentence scoring uses local rules by default. Set these environment variables on the server to add Claude scoring:

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude scoring when set. Unset = rules only. |
| `CLAUDE_MODEL` | Model to use. Default `claude-haiku-5-5` (cheap; about 1300 calls/day in the pilot). |

Claude only refines grammar, relevance and length, and adds a short tip. The "word used" score and copy detection always come from the rules. Each call has a 6 second timeout; on any error, timeout, refusal or invalid output the rules result is used, so a child is never blocked. Privacy: only the target word, its part of speech and meaning, and the child's sentence are sent (no names or IDs), and only after the local moderation check passes.
