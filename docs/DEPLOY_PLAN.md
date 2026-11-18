# Deploy plan: Vercel + hosted Postgres

Goal: run Shabd Mitra on Vercel the same way `pyq-dojo` runs: hosted Postgres on **Neon** through `DATABASE_URL`. The code stays plain Postgres, so Supabase would also work. The Express 5 API becomes one Vercel serverless function. The Vite PWA is served as static files with SPA rewrites. SQLite (`better-sqlite3`) is removed, because a Vercel function has no persistent disk.

Status: plan only. Nothing below is implemented yet.

---

## 1. Inventory: where the code touches the DB today

All access is synchronous `better-sqlite3` (`db.prepare(sql).get/all/run`, `db.transaction(fn)()`, `db.exec`). There are about 120 call sites.

| File | DB use | SQLite-specific things to change |
|---|---|---|
| `server/src/db/db.ts` | `openDb`, `migrate`, `getDb` singleton, `setDb` | the whole file is replaced (pragmas, file path) |
| `server/src/db/migrations.ts` | schema v1 (12 tables) | `INTEGER PRIMARY KEY`, `COLLATE NOCASE`, `strftime` defaults, `REAL` |
| `server/src/db/seed.ts` | `loadWordBank` (upsert words, named `@params`), `seedDemo` | `lastInsertRowid`, named params, sync tx |
| `server/src/index.ts` | opens the DB, loads the bank and seeds the demo **at boot** | moves to explicit scripts on Vercel |
| `server/src/auth.ts` | `issueToken`, `attachAuth` (token lookup), `assertTeacherOwnsClass/Student` | `attachAuth` swallows DB errors (must become a 503 instead); all functions become async |
| `server/src/mappers.ts` | `getClassRow` | async |
| `server/src/routes/auth.ts` | register, login, roster, student PIN login + lockout, me, logout | `lastInsertRowid`; `ORDER BY first_name COLLATE NOCASE` |
| `server/src/routes/classes.ts` | create class (retry on unique clash), list, update, roster add (tx), edit student, reset PIN | `isUniqueError` checks `SQLITE_CONSTRAINT*`; `lastInsertRowid` |
| `server/src/routes/words.ts` | search, teacher word create (tx, `MAX(CAST(SUBSTR(id,3)…))+1`), daily set override (tx), clear | `LIKE` is case-insensitive in SQLite but not in PG; id generation races |
| `server/src/routes/student.ts` | today, start session (`INSERT OR IGNORE`), attempts batch (tx), sentence (async Claude call, then insert), complete word/session, me/stats, leaderboard | `INSERT OR IGNORE`; prepared statements reused inside `forEach` |
| `server/src/routes/analytics.ts` | dashboard, leaderboard, class analytics, student detail, CSV export | passes `getDb()` into services |
| `server/src/services/dailySet.ts` | `getDailySet` (overrides, then words by `day_index`) | async |
| `server/src/services/scoringService.ts` | `completeWord`, `completeSession` (tx, XP ledger, streaks) | `INSERT OR IGNORE`; `strftime('now')` |
| `server/src/services/analytics.ts` | `classDashboard`, `leaderboard`, `buildProfiles`/`buildClassAnalytics`, `studentDetail`, export rows | N+1 prepared statements inside loops (each becomes a network round trip); `SUM`/`COUNT` |
| `server/src/routes/health.ts` | no DB | add a DB ping |
| `server/test/helpers.ts` | `openDb(':memory:')`, `setDb`, `loadWordBank` per test | needs a Postgres test harness |
| `server/test/auth.test.ts` | 2 raw `ctx.db.prepare(...).run` | to `await ctx.db.run` |
| `server/test/export.test.ts` | 4 raw inserts | to `await` + `RETURNING id` |
| `server/test/flow.test.ts` | `count(table)` helper, 1 raw select | async |
| `server/test/words.test.ts` | `loadWordBank` idempotency against its own `openDb` | async; use the shared test DB |
| `server/test/{roster,claude,evaluator}.test.ts` | through helpers only (evaluator: none) | follow the helpers |
| `e2e/student-flow.mjs` | starts the API with `DB_PATH=<tmp>/e2e.db` | needs a fresh PG database per scenario |

**In-memory state check (serverless has no shared memory).** None blocks the move:
- Auth tokens are already in `auth_tokens`.
- PIN lockout (`failed_pin_count`, `locked_until`) is already in the `students` table.
- All `Map`/`Set` uses in the services are per-request locals.
- The only module-level singletons are the DB handle (to be replaced by a pooled client in module scope, which is intended) and a per-call Anthropic client.
- There is no rate limiter or cache. If one is added later, it must use the DB, not memory.
- `FAKE_TODAY` is read per request from env.

## 2. Key decisions

| # | Decision | Why |
|---|---|---|
| K1 | Driver: **`pg` (node-postgres) `Pool`**, created once in module scope and reused across warm invocations. Defaults: `max: Number(process.env.PGPOOL_MAX ?? 3)`, `idleTimeoutMillis: 10_000`, `connectionTimeoutMillis: 5_000`, `allowExitOnIdle: true`. | `pyq-dojo` uses `pg`, and it is the most widely used driver. A small pool per instance avoids exhausting Neon's connection slots (pyq-dojo hit this: see `pyq-dojo/src/db/index.ts`). No ORM: keep the hand-written SQL. |
| K2 | **Neon pooled URL in production.** Use the `-pooler` host (PgBouncer, transaction mode); the Vercel–Neon integration sets `DATABASE_URL` to it. Like pyq-dojo (`pooledUrl()`), `db.ts` rewrites a `*.neon.tech` host without `-pooler` to `-pooler` automatically, so a direct URL pasted by mistake still pools. `max` is 3 behind the pooler and 10 locally. Migrations and seeds prefer `DATABASE_URL_UNPOOLED` (direct host) when it is set. Do not use named prepared statements (pgBouncer transaction mode breaks them). Plain `pool.query(text, params)` is unnamed, so it is safe. | serverless fan-out |
| K3 | **SSL**: Neon requires TLS. Connection strings carry `?sslmode=require`. `db.ts` strips `sslmode` from the URL and passes `ssl: { rejectUnauthorized: true }` explicitly. This avoids pg 8.x's `sslmode` deprecation warning, and Neon's certificates validate. SSL is off for `localhost`/`127.0.0.1`/unix sockets or when `PGSSLMODE=disable`. Neon cold-start on a suspended compute takes 1–3 s, so `connectionTimeoutMillis` is 10 000 for Neon hosts. | Neon requires TLS |
| K4 | **Keep `?` placeholders.** The DB layer converts `?` to `$1..$n`, skipping quoted literals. This keeps about 120 SQL strings almost untouched and reviews small. Named `@params` (only in `seed.ts`) become positional. | smallest diff |
| K5 | **Keep the column types the code expects.** Integers stay `integer` (int4, which arrives as a JS number). Booleans stay `integer` 0/1, because the code compares `=== 1` everywhere. `*_json` columns stay `text`; the code already does `JSON.parse`/`JSON.stringify`, and `tags_json LIKE` keeps working. IST dates stay `text 'YYYY-MM-DD'`. Timestamps stay **ISO-8601 `text`** with default `iso_now()`, because the code compares `expires_at > $iso` and `locked_until` as strings and the API returns these strings. `REAL` becomes `double precision`. Moving to native `boolean`/`jsonb`/`timestamptz` is a later, separate migration (out of scope). | behaviour parity with zero mapper changes |
| K6 | **bigint/numeric parsing**: `pg.types.setTypeParser(20, v => parseInt(v, 10))` (COUNT/SUM) and `setTypeParser(1700, parseFloat)` (AVG/SUM of numeric) in `db.ts`. Without this, `COUNT(*)` comes back as the *string* `"3"`. | silent correctness bug otherwise |
| K7 | **Migrations are explicit**: `npm run db:migrate`. They run inside one transaction guarded by `pg_advisory_xact_lock` (transaction-scoped, so it is safe behind pgBouncer). They **never run at function cold start.** `schema_migrations` is kept. | no DDL races between concurrent cold starts |
| K8 | **Word bank seed is explicit**: `npm run db:seed` upserts `content/words/part-*.json` (1830 words) in chunks of 200 rows as multi-row `INSERT … ON CONFLICT (id) DO UPDATE`, inside one transaction. It is idempotent. It falls back to `mini-bank.json` only when the bank is still empty **and** `--allow-fixture` is passed (tests and dev). | not at cold start; `content/` is not needed at runtime, so no `includeFiles` |
| K9 | **Demo data is explicit**: `npm run db:seed:demo` (the same data as today: `DEMO5A`, PIN `1234`). It **refuses when `VERCEL_ENV=production` or `NODE_ENV=production`** unless `--force` is passed. | demo PINs must not leak into prod |
| K10 | **Local dev stays one command.** `server/src/index.ts` (local only, never imported by Vercel) does migrate, then seeds the bank, then `seedDemo` when `SEED_DEMO!=0`, then `listen`. A long-running local process is not a cold start. `npm run dev` needs `DATABASE_URL`. If it is unset, it defaults to `postgres://postgres:postgres@localhost:5432/shabd`. | DX parity |
| K11 | **Vercel entry**: the API is pre-bundled with **esbuild** (already in `node_modules`) into `server/dist/handler.mjs`. A committed `api/index.mjs` re-exports it. Reasons: `@shabd/core` ships raw `.ts` (`main: ./src/index.ts`), and the server imports `./x.ts` paths, neither of which `@vercel/node`'s own TS compile handles reliably. `pg-native` is marked external. | robust build |
| K12 | **Tests use a real Postgres, not pg-mem.** This container has PostgreSQL 16 at `/usr/lib/postgresql/16/bin` (initdb/pg_ctl/postgres verified working as user `postgres`; root cannot run initdb). pg-mem 3.0.14 is installable, but it emulates PG incompletely (advisory locks, `FOR UPDATE`, expression unique indexes, `GENERATED … AS IDENTITY`, type parsers). Two backends would mean testing something other than prod. | most reliable offline option |
| K13 | **Concurrency is now real** (SQLite serialised everything). Rules: `INSERT OR IGNORE` becomes `ON CONFLICT … DO NOTHING`. Idempotent inserts keyed by `client_id` use `ON CONFLICT (client_id) DO NOTHING RETURNING *`, then a re-select on a miss. `completeSession` starts with `SELECT … FROM sessions WHERE id = ? FOR UPDATE`. Teacher word ids use a sequence (`'c-' \|\| nextval('teacher_word_seq')`). `isUniqueViolation(e)` checks `e.code === '23505'`. Never hold a transaction or connection during the Claude call, which already sits outside one. | correctness under parallel requests |
| K14 | Create the Neon project in **AWS Asia Pacific (Singapore) `aws-ap-southeast-1`**, the Neon region closest to Maharashtra, unless the Neon console offers a Mumbai region. Set the function region to the matching Vercel region: **`sin1`** for Singapore, or `bom1` if the DB is in Mumbai. Function and DB must be co-located because analytics runs N+1 queries. | latency |

## 3. DB layer contract (D1 implements it; D2 codes against it from day 1)

`server/src/db/db.ts`:

```ts
export type Row = Record<string, unknown>;
export interface Queryable {
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>;   // first row or undefined
  run(sql: string, params?: unknown[]): Promise<{ rowCount: number; rows: Row[] }>; // use 'RETURNING id' for ids
  exec(sql: string): Promise<void>;                                          // multi-statement, no params (migrations)
  /** Run fn in a transaction (BEGIN/COMMIT/ROLLBACK on one pooled client). Called on a tx handle it reuses that tx (flat, no savepoints). */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}
export type DB = Queryable & { end(): Promise<void> };
export function createDb(url: string, opts?: { max?: number }): DB;
export function getDb(): DB;            // lazy module-scope singleton from DATABASE_URL (or the local default)
export function setDb(db: DB): void;    // tests
export async function migrate(db: DB): Promise<number[]>;
export function isUniqueViolation(e: unknown): boolean; // pg code 23505
```

Placeholders: `?` → `$n` (outside `'…'` literals). Services keep their `db: DB` / `Queryable` parameter style. Inside a transaction, pass the `q` handle down, never `getDb()`.

## 4. Postgres schema (migration v1, rewritten for PG; same tables, columns and constraints)

Mapping rules for `server/src/db/migrations.ts` (the SQLite migration is replaced; there is no prod data to carry over):

- Migration 1 first creates `CREATE OR REPLACE FUNCTION iso_now() RETURNS text LANGUAGE sql VOLATILE AS $$ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;`. Every `DEFAULT (strftime(...))` becomes `DEFAULT iso_now()`, and `scoringService`'s `strftime('now')` becomes `iso_now()`.
- `id INTEGER PRIMARY KEY` becomes `id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` (tests may still insert explicit ids).
- `teachers.email … UNIQUE COLLATE NOCASE` becomes `email text NOT NULL` plus `CREATE UNIQUE INDEX teachers_email_lower_uq ON teachers (lower(email))`. Queries use `lower(email) = lower(?)`; the route already lowercases.
- `REAL` becomes `double precision`. `INTEGER`/`TEXT` stay `integer`/`text`. All CHECKs, UNIQUEs, FKs (`ON DELETE CASCADE`) and indexes are kept as they are.
- `CREATE SEQUENCE teacher_word_seq;` (K13).
- `schema_migrations(version integer PRIMARY KEY, name text NOT NULL, applied_at text NOT NULL DEFAULT iso_now())`.

SQL dialect fixes in routes/services (D2):

| SQLite | Postgres |
|---|---|
| `INSERT OR IGNORE INTO sessions …` | `… ON CONFLICT (student_id, date) DO NOTHING` |
| `INSERT OR IGNORE INTO xp_ledger …` | `… ON CONFLICT (ref_session_id, source) DO NOTHING` |
| `info.lastInsertRowid` | `INSERT … RETURNING id` + `get` |
| `ORDER BY first_name COLLATE NOCASE, id` | `ORDER BY lower(first_name), id` |
| `word LIKE ? ESCAPE '\'` (case-insensitive in SQLite) | `word ILIKE ? ESCAPE '\'` (same for `meaning`, `tags_json`, and the ORDER BY prefix match) |
| `MAX(CAST(SUBSTR(id,3) AS INTEGER))+1` | `'c-' \|\| nextval('teacher_word_seq')` |
| `e.code?.startsWith('SQLITE_CONSTRAINT')` | `isUniqueViolation(e)` |
| `db.transaction(() => …)()` | `await db.tx(async (q) => …)`; replace `forEach` with `for…of` so awaits run in order |
| a failed statement inside a tx | aborts the PG tx: never catch-and-continue inside `tx` (class-code retry stays outside a tx, as today) |

## 5. Vercel configuration (D3)

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "npm ci",
  "buildCommand": "npm run vercel-build",
  "outputDirectory": "apps/web/dist",
  "regions": ["sin1"],
  "functions": { "api/index.mjs": { "maxDuration": 30 } },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/((?!api(?:/|$)).*)", "destination": "/index.html" }
  ],
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
```

- Static files win over rewrites, so `/assets/*`, `/sw.js`, `/manifest.webmanifest` and `/icon.svg` are served as files. Every other non-API path gets `index.html` (React Router).
- `api/index.mjs` (committed): `export { default } from '../server/dist/handler.mjs';`
- `server/src/vercel.ts`: `import { createApp } from './app.ts'; export default createApp();`. No `listen`, no migrate, no seed.
- `scripts/build-api.mjs`: esbuild `server/src/vercel.ts` → `server/dist/handler.mjs` (`bundle`, `platform: 'node'`, `format: 'esm'`, `target: 'node22'`, `external: ['pg-native']`, plus a `banner` that defines `require` via `createRequire` for CJS deps). Add `server/dist/` to `.gitignore`.
- Root `package.json`: `"vercel-build": "npm run build -w @shabd/web && node scripts/build-api.mjs"`. Change `engines.node` to `"22.x"`, which Vercel needs to pin the runtime.
- maxDuration of 30 s covers the 6 s Claude timeout (`CLAUDE_CALL_TIMEOUT_MS`), a cold start, and the CSV export.
- No `includeFiles`: the runtime never reads `content/` (K8).
- Optional: `attachDatabasePool(pool)` from `@vercel/functions` so idle sockets close before suspension. Use it only if the package installs cleanly; otherwise rely on `idleTimeoutMillis`.

**Env vars (Vercel → Project → Settings → Environment Variables)**

| Var | Prod | Notes |
|---|---|---|
| `DATABASE_URL` | **required** | Neon pooled URL (`…-pooler….neon.tech/…?sslmode=require`); the Vercel–Neon integration sets it |
| `DATABASE_URL_UNPOOLED` | optional | Neon direct URL (the integration sets it too); preferred by `db:migrate`/`db:seed` |
| `PGPOOL_MAX` | optional | default 3 |
| `TEACHER_INVITE_CODE` | **strongly recommended** | otherwise anyone can register as a teacher |
| `ANTHROPIC_API_KEY` | optional | turns on Claude feedback |
| `CLAUDE_MODEL` | optional | the code's default applies when unset |
| `FAKE_TODAY` | **never** | `clock.ts` ignores it when `VERCEL_ENV === 'production'` |
| `SEED_DEMO`, `PORT`, `API_PORT`, `DB_PATH` | n/a | local only; `DB_PATH` is removed |

**First deploy runbook, Neon** (goes in `docs/DEPLOY.md` and the README):
1. Create a Neon project at console.neon.tech: region Singapore (`aws-ap-southeast-1`), Postgres 16, database `shabd`.
2. Copy both connection strings from Dashboard → Connect. "Pooled connection" ON gives the `-pooler` host; OFF gives the direct host. Both end in `?sslmode=require`.
3. From a laptop: `DATABASE_URL='<direct url>' npm run db:migrate && DATABASE_URL='<direct url>' npm run db:seed`. Expect 1830 words.
4. Import the GitHub repo in Vercel (framework "Other"; `vercel.json` supplies the settings). Either add the **Neon integration** (Vercel → Storage / Integrations → Neon → link the existing project), which sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`, or paste them by hand. Then add `TEACHER_INVITE_CODE`, and optionally `ANTHROPIC_API_KEY`/`CLAUDE_MODEL`.
5. Set the Vercel function region to `sin1` (already in `vercel.json`). Deploy.
6. Optional: Neon branching for previews. The integration can create a DB branch per preview deployment; run `db:migrate` against that branch, or seed from main.
5. Check `GET /api/health` → `{ ok: true, db: 'ok', words: 1830 }`.
6. On every schema change, run `db:migrate` **before** promoting the deploy.

**Local Postgres one-liner** (README): `docker run -d --name shabd-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`, then `npm run dev`. Without Docker: `node scripts/pg-local.mjs start`, which uses system `initdb`/`pg_ctl`.

## 6. Tests and e2e

- **Harness** (D1): `scripts/pg-local.mjs start|stop|url`.
  - It finds `initdb`/`pg_ctl` on `PATH` or `/usr/lib/postgresql/*/bin`, keeps data in `$TMPDIR/shabd-pg-<uid>`, listens on port 54329, and uses `--auth=trust`.
  - When running as root, it runs the commands via `su postgres -s /bin/sh -c …` (needed in this container).
  - It is idempotent: if the cluster is already running, it just prints the URL.
- `server/vitest.config.ts` uses `globalSetup: test/pg-global-setup.ts` and `fileParallelism: false`. The global setup:
  1. Uses `TEST_DATABASE_URL`. If that is unset, it calls `pg-local start`; if that also fails, it throws a message containing the docker one-liner.
  2. Drops and recreates database `shabd_test`, then runs `migrate`.
  3. Exports `DATABASE_URL` for the workers.
- `test/helpers.ts` `setup()` becomes **async**:
  1. `TRUNCATE` all tables `RESTART IDENTITY CASCADE` (except `schema_migrations`) and `ALTER SEQUENCE teacher_word_seq RESTART`.
  2. Load `mini-bank.json` via `loadWordBank(db, '/nonexistent', { allowFixture: true })`.
  3. Return `{ app, db }`.
  Every `beforeEach(() => { ctx = setup(); })` becomes `beforeEach(async () => { ctx = await setup(); })`. Add `afterAll(() => getDb().end())`.
- `npm test` at the root keeps working with no env vars in this container and on any machine that has PG or Docker.
- **e2e** (D3): `startStack()` creates `CREATE DATABASE shabd_e2e_<rand>` on the test cluster, runs `db:migrate`, `db:seed` and `db:seed:demo` against it, starts the API with `DATABASE_URL=<that db>`, and drops the DB on exit. Add `npm run e2e:prod`: it serves `apps/web/dist` and `server/dist/handler.mjs` through a small node script that mimics the vercel.json rewrites, then runs the same scenarios. This checks the bundle, not just the dev server.

## 7. Parallel tasks (Sonnet-sized, exact file ownership)

Order: D1 lands `db.ts` and the test harness first (the contract in section 3 is fixed, so D2 and D3 start immediately in parallel). D2's tests go green once D1 is merged. Each task edits **only** its own files. If a task needs a change in a file it does not own, it asks that file's owner instead.

### D1: DB layer, schema, seed scripts, test harness
Owns:
- `server/src/db/db.ts`, `server/src/db/migrations.ts`, `server/src/db/seed.ts`
- `server/src/index.ts`
- `server/scripts/migrate.ts`, `server/scripts/seed.ts`, `server/scripts/seed-demo.ts` (new)
- `scripts/pg-local.mjs` (new)
- `server/vitest.config.ts`, `server/test/pg-global-setup.ts`, `server/test/helpers.ts`, `server/test/db.test.ts` (new)
- `server/package.json`, `.env.example`, `.gitignore`

Steps:
1. `npm i -w @shabd/server pg` and `npm i -D -w @shabd/server @types/pg`. Remove `better-sqlite3` and `@types/better-sqlite3`.
2. Implement the section 3 contract, plus K1–K3 (pool, SSL), K6 (type parsers), K7 (advisory-locked migrate) and section 4 (schema, `iso_now()`, sequence).
3. `seed.ts`: async `loadWordBank(db, dir, { allowFixture })` with chunked upsert, and async `seedDemo(db)` with the production guard (K9).
4. Scripts in `server/package.json`: `db:migrate`, `db:seed`, `db:seed:demo` (`tsx --env-file-if-exists=../.env scripts/…`). Change `dev`/`start` so that `index.ts` migrates and seeds (K10). Remove `db:reset`, or make it `DROP SCHEMA public CASCADE; CREATE SCHEMA public` with a production guard.
5. `db.test.ts`: placeholder conversion; tx commit and rollback; nested `tx` reuse; `COUNT` returns a number; `isUniqueViolation`; migrate is idempotent; the seed upsert is idempotent (moved from `words.test.ts` lines 120–135).

Accept:
- `node scripts/pg-local.mjs start` works in this container.
- `db.test.ts` is green.
- `npm run db:migrate && npm run db:seed` loads **1830** words; re-running changes nothing.
- `db:seed:demo` refuses with `VERCEL_ENV=production`.
- `grep -r better-sqlite3 server/` is empty.

### D2: Convert routes and services to async PG, fix tests
Owns:
- `server/src/auth.ts`, `server/src/mappers.ts`, `server/src/clock.ts`, `server/src/app.ts`, `server/src/http.ts`
- `server/src/routes/*.ts`, `server/src/services/*.ts`
- `server/test/*.test.ts` except `db.test.ts`

Steps:
1. Make every DB call `await` (inventory in section 1). Handlers become `async` (Express 5 forwards rejections to `errorHandler`).
2. `attachAuth` becomes async. It still treats an invalid token as "no auth", but on a DB **error** it calls `next(err)`, giving a 500/503 instead of a misleading 401.
3. Apply the section 4 dialect table and K13 (`ON CONFLICT`, `FOR UPDATE` in `completeSession`, catch 23505 on `client_id` races and return the stored row).
4. `health.ts`: `SELECT COUNT(*) FROM words WHERE source='bank'`, returning `{ ok, db: 'ok', words }`, or 503 when the DB is down.
5. `clock.ts`: ignore `FAKE_TODAY` when `VERCEL_ENV === 'production'`.
6. Optional, only if it is trivial: collapse the per-student loops in `analytics.classDashboard` into one `GROUP BY` query each.
7. Tests: `await setup()`, `await ctx.db.run/get`, and `RETURNING id` instead of `lastInsertRowid`.
8. Add one concurrency test: complete the same session twice with `Promise.all`; the XP ledger has no duplicate rows and the totals match.

Accept:
- `npm test` (all workspaces) is green against PG, with the same assertions as before (no assertion was weakened).
- `npm run typecheck` is clean.
- No `.prepare(` and no `getDb()` call inside a `tx` callback.

### D3: Vercel config, API entry, build, docs, e2e
Owns:
- `vercel.json`, `api/index.mjs`, `server/src/vercel.ts`
- `scripts/build-api.mjs`, `scripts/serve-prod.mjs` (new)
- root `package.json` (add `vercel-build`, `e2e:prod`, and pass-through `db:migrate`/`db:seed`/`db:seed:demo` → `-w @shabd/server`; change engines to `22.x`)
- `e2e/student-flow.mjs`, `README.md`, `docs/DEPLOY.md` (new, the user-facing guide)
- `apps/web/vite.config.ts` (only if PWA/SW tweaks are needed)

Steps:
1. Write the files from section 5.
2. Write `serve-prod.mjs` (static `apps/web/dist` + `/api/*` → handler + SPA fallback).
3. Update the e2e for PG (section 6).
4. Update the README env table, scripts table and Deploy section (runbook plus the local PG one-liner). Remove all SQLite mentions.

Accept:
- `npm run vercel-build` produces `apps/web/dist/index.html` and `server/dist/handler.mjs`.
- `node -e "import('./api/index.mjs').then(m=>console.log(typeof m.default))"` prints `function`.
- `npm run e2e` and `npm run e2e:prod` pass.
- If `npx vercel build` can run offline with a stub `.vercel/project.json`, it succeeds and `.vercel/output/functions/api/index.func` exists. If it cannot run offline, record that in the report; it is not a blocker.
- A deep link such as `/teacher/classes/1` serves `index.html` under `serve-prod.mjs`.

### Final integration (lead)
1. Merge D1, then D2, then D3.
2. Full `npm test`, `npm run typecheck`, `npm run e2e`, `npm run e2e:prod`.
3. First real deploy to a Vercel **preview** with a Neon branch DB.
4. Smoke checks on the preview: `/api/health`, teacher register (with the invite code), class creation, a student's day, the CSV export.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `COUNT`/`SUM` come back as bigint strings | wrong XP and totals, string concatenation | K6 type parsers plus the D1 test |
| Rewrite to `/api` changes `req.url` and Express cannot see `/api/...` | every API call returns 404 | verify on a preview. If it breaks, use `"destination": "/api/index.mjs?__p=$1"` and restore `req.url` in `vercel.ts` from `__p` |
| Connection exhaustion (many warm instances) | 5xx under a classroom burst (40 students at 9 am) | pooled URL (K2) and `max` of 3 |
| Cross-region latency × N+1 analytics queries | slow teacher dashboard and export | co-locate the function and DB (K14); optional GROUP BY refactor (D2 step 6) |
| Races that SQLite used to serialise (double submit, outbox replays from flaky school Wi-Fi) | duplicate XP, 500 on 23505 | K13; D2 concurrency test |
| A failed statement aborts the PG tx | unexpected 500s in batch endpoints | no catch-and-continue inside `tx`; validate before writing |
| Migrations not run before deploy | 500 `relation does not exist` | runbook step; `/api/health` reports the schema version; optional later: `vercel-build` runs `db:migrate` when `VERCEL_ENV=production` |
| esbuild bundling CJS deps (express, Anthropic SDK) into ESM | `require is not defined` at runtime | `createRequire` banner; the `e2e:prod` and import smoke tests catch it |
| Service worker caching a stale `index.html` after deploy | users stuck on an old UI | `sw.js` no-cache header; `registerType: 'autoUpdate'` is already set |
| Demo data or `FAKE_TODAY` reaching prod | known PIN 1234 / wrong "today" | K9 guard; `clock.ts` prod guard |
| Open teacher registration on a public URL | spam accounts | set `TEACHER_INVITE_CODE` in prod (README marks it required) |
| Tests need a Postgres binary or Docker | CI or another dev machine cannot run tests | `TEST_DATABASE_URL` override; a GitHub Actions `services: postgres` snippet in `docs/DEPLOY.md` |
| Neon free-tier auto-suspend (scale to zero after 5 min idle) | 1–3 s first request after idle | `connectionTimeoutMillis` of 10 s (K3); acceptable for the pilot; a paid plan can disable suspend |
| Neon connection limit on small computes (~100 direct) | sign-in outage under a burst (seen in pyq-dojo) | always the `-pooler` host at runtime (K2 auto-rewrite) |
