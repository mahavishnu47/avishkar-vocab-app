# Deploying WordWise (Vercel + Neon)

This guide takes you from nothing to a live website. You need: a GitHub account with this repo, a free Neon account, a free Vercel account, and a laptop with **Node 22** and `git` installed. No server knowledge is needed. Allow about 30 minutes.

How it fits together: **Neon** stores the data (a Postgres database). **Vercel** serves the app (the web pages and the API). The app finds the database through one setting called `DATABASE_URL`.

## Part 1. Create the database on Neon

1. Go to https://console.neon.tech and sign up (the "Continue with GitHub" button is easiest).
2. Click **Create project** (or **New Project**).
3. Fill the form:
   - **Project name**: `shabd-mitra`
   - **Postgres version**: 16
   - **Cloud provider / Region**: **AWS** and **Asia Pacific (Singapore) `aws-ap-southeast-1`** (closest to Maharashtra; if Neon lists a Mumbai region, use that and ask whoever maintains the project to change `regions` in `vercel.json` to `bom1`).
   - **Database name**: `shabd`
4. Click **Create**. You land on the project dashboard.
5. Click the **Connect** button on the dashboard. A box shows a connection string.
   - Turn the **Connection pooling** switch **ON**. Copy the string. It contains `-pooler` in the host name. This is your **pooled URL**. Paste it somewhere safe (a private note).
   - Turn the switch **OFF**. Copy the string again. There is no `-pooler` in it. This is your **direct URL**.
   - Both look like `postgresql://user:password@ep-something...neon.tech/shabd?sslmode=require`. Treat them like passwords: never post them in chat or commit them to git.

## Part 2. Create the tables and load the words (from your laptop)

Do this once, before the first deploy.

1. Open a terminal and run:
   ```bash
   git clone <your repo url> shabd-mitra
   cd shabd-mitra
   npm install
   ```
2. Create the tables, using the **direct URL** (keep the quotes):
   ```bash
   DATABASE_URL='PASTE-DIRECT-URL-HERE' npm run db:migrate
   ```
   It lists the migrations applied. Running it again is harmless.
3. Load the 1830-word bank:
   ```bash
   DATABASE_URL='PASTE-DIRECT-URL-HERE' npm run db:seed
   ```
   Expect a message saying 1830 words. Running it again changes nothing.
4. Do **not** run `db:seed:demo` against the real database (it adds a demo teacher with a known PIN, and it refuses in production on purpose). If you want to try the app with fake data first, create a separate Neon branch or project for that.

On Windows PowerShell, set the variable first: `$env:DATABASE_URL='PASTE-DIRECT-URL-HERE'` and then run `npm run db:migrate`, then `npm run db:seed`.

## Part 3. Deploy on Vercel

1. Go to https://vercel.com and sign up with GitHub.
2. Click **Add New...** then **Project**. Find your repo in the list and click **Import** (if it is missing, click **Adjust GitHub App Permissions** and allow the repo).
3. On the "Configure Project" page:
   - **Framework Preset**: **Other**.
   - Leave Build Command, Output Directory and Install Command alone. They come from `vercel.json`.
   - Open **Environment Variables** and add these (name, then value, then **Add**):
     | Name | Value |
     |---|---|
     | `DATABASE_URL` | the Neon **pooled URL** from Part 1 |
     | `SUPER_ADMIN_SECRET` | a secret you invent, **at least 16 random characters** (a password manager can generate one). It unlocks the `/admin` page where you create schools. Without it the page is switched off. |
     | `PUBLIC_APP_URL` | your final app address, for example `https://shabd-mitra.vercel.app` (no slash at the end). Used in every link you share on WhatsApp. **Required in production.** |
     | `VITE_CONTACT_TEXT` | optional, for example `WhatsApp 98xxxxxx`. Shown as "New school? ..." on the landing page. |
     | `ANTHROPIC_API_KEY` | optional, only if you want Claude sentence feedback |
     | `CLAUDE_MODEL` | optional; leave blank for the default |
   - Never add `FAKE_TODAY`.
   - If an older deploy set `TEACHER_INVITE_CODE`, delete it. It no longer does anything: teachers now join with their own school's invite code.
   - Alternative to pasting `DATABASE_URL` by hand: after the first deploy, open the project, go to **Storage** (or **Integrations**), choose **Neon**, and link your existing project. It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` for you.
4. Click **Deploy**. Wait 1 to 3 minutes. If it fails, open the build log and see Troubleshooting below.
5. If you added a variable after the first deploy, go to **Deployments**, open the latest one, click the three dots, and choose **Redeploy** so it takes effect.

## Part 4. Smoke test

Replace `YOUR-APP` with the domain Vercel shows (like `shabd-mitra.vercel.app`).

1. `https://YOUR-APP.vercel.app/api/health` should show `{"ok":true,"db":"ok","words":1830}`. The first call after a quiet spell can take a few seconds because the free Neon database wakes up.
2. `https://YOUR-APP.vercel.app/admin` asks for the super admin secret (Part 5 uses it).
3. Follow Part 5 to create a school, then create a class, add a few students, and print the login cards.
4. On a phone open the class link `https://YOUR-APP.vercel.app/j/<class code>`, tap a name, enter the PIN, and play a day's 5 words.
5. Reload a deep page like `https://YOUR-APP.vercel.app/teacher/analytics` in the browser: it should still load (not a 404).
6. In the teacher app, open Analytics and download the CSV.

## Part 5. Create your first school

Schools are created by invitation only. There is no public signup.

**Option A: the `/admin` page (easiest, works from a phone).**
1. Open `https://YOUR-APP.vercel.app/admin` and type your `SUPER_ADMIN_SECRET`.
2. Tap **New school**, type the school name (district and the 11-digit UDISE code are optional) and tap **Create**.
3. A card shows the **school setup link** (`https://YOUR-APP.vercel.app/a/ABCDEFGH`) and a ready message. Tap **WhatsApp** (or **Copy**) and send it to the principal. The link works once and expires after 14 days. If it is lost, tap **New setup link** on the school's row.

**Option B: the command line (from the laptop that has the repo).**
```bash
DATABASE_URL='PASTE-DIRECT-URL-HERE' PUBLIC_APP_URL='https://YOUR-APP.vercel.app' \
  npm run admin -- create-school --name "ZP School Kalwa" --district Thane
```
It prints the setup link. Other commands: `npm run admin -- list` and `npm run admin -- setup-link --school <id>`.

To pause a school, tap **Suspend** on its row in `/admin`. All its users are signed out until you tap **Resume**.

## Pilot day checklist

1. **You:** create the school (Part 5) and send the setup link to the principal.
2. **Principal:** opens the link, enters name, email and password (about 2 minutes), then taps **WhatsApp** on the "Invite your teachers" step to send the teacher link to the staff group.
3. **Each teacher:** opens the teacher link, enters name, email and password, and creates their class (standard and division, 3 taps).
4. **Each teacher:** pastes the class list (roll number and first name), ticks the consent box, and saves.
5. **Each teacher:** prints the login cards (8 per page) and hands them out, then taps **Send on WhatsApp** to share the class join link with parents.
6. **Children:** open the link on the parent's phone, tap their name, type the PIN from the card, watch the 30-second welcome, and play.
7. **Principal:** checks the **Progress** screen the next morning (joined and played counts per class).

The plain-language version for schools is in [ONBOARDING_GUIDE.md](ONBOARDING_GUIDE.md).

## Later changes

- **Schema changes**: run `DATABASE_URL='<direct url>' npm run db:migrate` **before** promoting the new deployment, otherwise you can get "relation does not exist" errors. This is especially important for the onboarding release (migration v2 adds `school_id` columns that the new server needs, and the old server cannot insert rows after it), so migrate and deploy in one go.
- **Lost secret or lost principal**: change `SUPER_ADMIN_SECRET` in Vercel and redeploy; make a fresh setup link from `/admin` for a principal who lost access.
- **Preview deployments**: with the Neon integration enabled, Neon can create a database branch per preview. Run `db:migrate` and `db:seed` against that branch's direct URL.
- **Custom domain**: Vercel project, **Settings**, **Domains**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/api/health` returns 503 or `db` is not `ok` | `DATABASE_URL` is missing or wrong in Vercel. Fix it and Redeploy. |
| `/api/health` says `words: 0` or "relation does not exist" | Part 2 was skipped or run against a different database. Re-run it with the right URL. |
| Errors about too many connections | Use the pooled URL (host contains `-pooler`) in Vercel. |
| First request is slow, then fast | Free Neon sleeps after 5 minutes idle. Normal. |
| Share links show the wrong address (a `...-git-...vercel.app` preview) | Set `PUBLIC_APP_URL` in Vercel to your real address and Redeploy. |
| `/admin` shows "not found" | `SUPER_ADMIN_SECRET` is missing or shorter than 16 characters. Fix it and Redeploy. |
| Phones keep showing an old version | Close and reopen the app once; the service worker updates itself. |
| Build fails on Node version | The project pins Node 22 (`engines`). In Vercel, **Settings > General > Node.js Version** should be 22.x. |

## Running the checks on another machine

`npm test` and `npm run e2e` need a Postgres. They use a throwaway local one (`node scripts/pg-local.mjs start`) or the one in `TEST_DATABASE_URL`. For GitHub Actions add a Postgres service:

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_PASSWORD: postgres }
    ports: ['5432:5432']
    options: >-
      --health-cmd pg_isready --health-interval 5s --health-retries 10
env:
  TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
```
