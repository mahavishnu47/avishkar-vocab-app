#!/usr/bin/env node
// Runs pending database migrations during a PRODUCTION Vercel build, before the app is built and deployed.
// - Preview/local builds skip it (they must never touch the production database).
// - If a migration fails the build fails, so the previous deployment stays live.
// - Safe to re-run: applied migrations are skipped.
import { spawnSync } from 'node:child_process';

if (process.env.VERCEL_ENV !== 'production') {
  console.log(`[migrate-on-build] VERCEL_ENV=${process.env.VERCEL_ENV ?? '(unset)'}: skipping migrations`);
  process.exit(0);
}
if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
  console.error('[migrate-on-build] DATABASE_URL is not set in Vercel Production: cannot migrate');
  process.exit(1);
}
console.log('[migrate-on-build] applying pending migrations to the production database…');
const r = spawnSync('npm', ['run', 'db:migrate'], { stdio: 'inherit', shell: true, env: process.env });
process.exit(r.status ?? 1);
