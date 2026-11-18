#!/usr/bin/env node
// One-shot deploy: Neon (Postgres) + Vercel. Cross-platform (Windows/Mac/Linux).
// Run from the repo root AFTER `neonctl auth` and `vercel login`. Re-runnable.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
const invite = (await rl.question('Teacher invite code (a secret you invent; teachers need it to sign up): ')).trim();
rl.close();
if (!invite) { console.error('Invite code is required.'); process.exit(1); }

const vars = { DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct, TEACHER_INVITE_CODE: invite };
for (const [k, v] of Object.entries(vars)) {
  run('vercel', ['env', 'rm', k, 'production', '--yes'], { allowFail: true });
  run('vercel', ['env', 'add', k, 'production'], { input: v });
  console.log('set', k);
}

console.log('== Deploying ==');
run('vercel', ['--prod'], { capture: false });
console.log('\nDone. Open <your-url>/api/health  (expect db: ok, words: 1830)');
