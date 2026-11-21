#!/usr/bin/env node
// One-shot deploy: Neon (Postgres) + Vercel. Cross-platform (Windows/Mac/Linux).
// Run from the repo root AFTER `neonctl auth` and `vercel login`. Re-runnable.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline/promises';

const NAME = process.env.NEON_PROJECT_NAME || 'avishkar-vocab-app';
const REGION = process.env.NEON_REGION || 'aws-ap-southeast-1';

// shell:true so Windows finds neonctl.cmd / vercel.cmd / npm.cmd
function run(cmd, args, { input, env, capture = true, allowFail = false } = {}) {
  const r = spawnSync(cmd, args, {
    shell: true, encoding: 'utf8', input,
    env: { ...process.env, ...env },
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'inherit', 'inherit'],
  });
  if (r.status !== 0 && !allowFail) {
    console.error(`\nFAILED: ${cmd} ${args.join(' ')}\n${r.stderr || ''}${r.stdout || ''}`);
    process.exit(1);
  }
  return (r.stdout || '').trim();
}

for (const tool of ['neonctl', 'vercel']) {
  const r = spawnSync(tool, ['--version'], { shell: true, encoding: 'utf8' });
  if (r.status !== 0) { console.error(`Missing ${tool}. Run: npm install -g neonctl vercel`); process.exit(1); }
}

console.log('== Neon project ==');
const list = JSON.parse(run('neonctl', ['projects', 'list', '--output', 'json']));
const projects = list.projects || list;
let proj = projects.find((p) => p.name === NAME);
if (!proj) {
  const created = JSON.parse(run('neonctl', ['projects', 'create', '--name', NAME, '--region-id', REGION, '--output', 'json']));
  proj = created.project || created;
  console.log('created', proj.id);
} else console.log('reusing', proj.id);

const pooled = run('neonctl', ['connection-string', '--project-id', proj.id, '--pooled']);
const direct = run('neonctl', ['connection-string', '--project-id', proj.id]);
if (!pooled.startsWith('postgres')) { console.error('Could not read connection string:', pooled); process.exit(1); }
const dbEnv = { DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct };

console.log('== Tables + 1,830 words ==');
run('npm', ['run', 'db:migrate'], { env: dbEnv, capture: false });
run('npm', ['run', 'db:seed'], { env: dbEnv, capture: false });

console.log('== Vercel ==');
if (!existsSync('.vercel')) run('vercel', ['link', '--yes'], { capture: false });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question('Super admin secret (16+ characters; press Enter to generate one): ')).trim();
const appUrl = (await rl.question('Public app URL, e.g. https://shabd-mitra.vercel.app (Enter to skip for now): ')).trim().replace(/\/+$/, '');
const contact = (await rl.question('Contact line for "New school?" on the landing page, e.g. WhatsApp 98xxxxxx (optional): ')).trim();
rl.close();
const secret = typed || randomBytes(18).toString('base64url');
if (secret.length < 16) { console.error('SUPER_ADMIN_SECRET must be at least 16 characters.'); process.exit(1); }
if (!typed) console.log(`\nGenerated SUPER_ADMIN_SECRET (save it in your password manager, it is shown only now):\n  ${secret}\n`);

const vars = { DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct, SUPER_ADMIN_SECRET: secret };
if (appUrl) vars.PUBLIC_APP_URL = appUrl;
if (contact) vars.VITE_CONTACT_TEXT = contact;
// The old shared teacher code no longer exists; remove it if a previous deploy set it.
run('vercel', ['env', 'rm', 'TEACHER_INVITE_CODE', 'production', '--yes'], { allowFail: true });
for (const [k, v] of Object.entries(vars)) {
  run('vercel', ['env', 'rm', k, 'production', '--yes'], { allowFail: true });
  run('vercel', ['env', 'add', k, 'production'], { input: v });
  console.log('set', k);
}

console.log('== Deploying ==');
run('vercel', ['--prod'], { capture: false });
console.log('\nDone. Open <your-url>/api/health  (expect db: ok, words: 1830).');
console.log('Then open <your-url>/admin, enter the secret, and create your first school (docs/DEPLOY.md, Part 5).');
if (!appUrl) console.log('Remember to set PUBLIC_APP_URL in Vercel to your final https URL and redeploy, so share links are correct.');
