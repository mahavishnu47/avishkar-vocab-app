/**
 * End-to-end check: student plays 5 words at two phone sizes; teacher reviews. Re-runnable:
 * every run creates a fresh Postgres database (migrate + word bank + demo seed) on the local throwaway cluster
 * (scripts/pg-local.mjs, or TEST_DATABASE_URL), starts the API plus a Vite dev server, and drops the DB at the end.
 * Usage: npm run e2e        (dev servers)
 *        npm run e2e:prod   (built bundle: needs `npm run vercel-build`; scripts/serve-prod.mjs mimics vercel.json)
 * Env: FAKE_TODAY=YYYY-MM-DD optional, HEADED=1 to watch, E2E_VERBOSE=1 for server logs.
 * Needs the preinstalled `playwright` + chromium (no new deps).
 */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import net from 'node:net';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let pw;
for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) {
  try { pw = require(id); break; } catch { /* try next */ }
}
if (!pw) { console.error('playwright not found'); process.exit(2); }

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
  s.on('error', rej);
});
async function waitFor(url, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up */ }
    if (Date.now() > end) throw new Error(`timeout waiting for ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const procs = [];
function run(cmd, args, opts) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts });
  p.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  procs.push(p);
  return p;
}
const killAll = () => { for (const p of procs.splice(0)) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } } };

const PROD = process.argv.includes('--prod');
const serverRequire = createRequire(join(ROOT, 'server', 'package.json'));

/** Throwaway local Postgres cluster (D1 harness: scripts/pg-local.mjs). TEST_DATABASE_URL overrides it. */
function clusterUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const out = execFileSync('node', [join(ROOT, 'scripts/pg-local.mjs'), 'start'], { encoding: 'utf8' });
  const m = out.match(/postgres(?:ql)?:\/\/\S+/);
  if (!m) throw new Error(`pg-local.mjs printed no URL:\n${out}`);
  return m[0];
}
function npmRun(script, env) {
  execFileSync('npm', ['run', script, '-w', '@shabd/server', '--silent'], { cwd: ROOT, env, stdio: process.env.E2E_VERBOSE ? 'inherit' : 'ignore' });
}

/** Fresh Postgres database + API + web for one scenario. Returns a cleanup() that drops the database. */
async function startStack() {
  const { Client } = serverRequire('pg');
  const adminUrl = clusterUrl();
  const name = `shabd_e2e_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const u = new URL(adminUrl); u.pathname = `/${name}`;
  const databaseUrl = u.toString();
  const apiPort = await freePort();
  const webPort = await freePort();
  const env = { ...process.env, PORT: String(apiPort), API_PORT: String(apiPort), DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl, SEED_DEMO: '1' };
  delete env.VERCEL_ENV; delete env.NODE_ENV;
  const cleanup = async () => {
    killAll();
    try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } catch (e) { console.error('drop db failed', e.message); }
    await admin.end().catch(() => {});
  };
  try {
    npmRun('db:migrate', env); npmRun('db:seed', env); npmRun('db:seed:demo', env);
    let base;
    if (PROD) {
      run('node', [join(ROOT, 'scripts/serve-prod.mjs'), String(webPort)], { cwd: ROOT, env });
      base = `http://127.0.0.1:${webPort}`;
      await waitFor(`${base}/api/health`);
      const deep = await fetch(`${base}/teacher/classes/1`);
      assert((await deep.text()).includes('<div id="root"'), 'deep link should serve index.html');
    } else {
      run('npx', ['tsx', 'src/index.ts'], { cwd: join(ROOT, 'server'), env });
      await waitFor(`http://localhost:${apiPort}/api/health`);
      run('npx', ['vite', '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], { cwd: join(ROOT, 'apps/web'), env });
      base = `http://127.0.0.1:${webPort}`;
      await waitFor(base);
    }
    return { base, name, cleanup };
  } catch (e) { await cleanup(); throw e; }
}

let checks = 0;
function assert(cond, msg) { checks++; if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); }

async function noHScroll(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  assert(o.sw <= o.cw && o.bw <= o.cw, `${label}: horizontal scroll (scrollWidth ${o.sw} / body ${o.bw} > client ${o.cw})`);
}
async function noTextInputs(page, label) {
  const n = await page.locator('input, textarea').count();
  assert(n === 0, `${label}: found ${n} <input>/<textarea>`);
}

async function typeText(page, text) {
  for (const ch of text) {
    if (ch === ' ') await page.locator('.osk-space').click();
    else if (/[a-z]/i.test(ch)) await page.locator(`button[aria-label="letter ${ch.toLowerCase()}"]`).click();
    else await page.locator(`button[aria-label="punctuation ${ch}"]`).click();
  }
}

async function studentFlow(browser, base, vp) {
  const tag = `${vp.width}x${vp.height}`;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  let words = null;
  page.on('response', async (r) => {
    if (r.url().endsWith('/api/student/sessions/today') && r.ok()) { try { words = (await r.json()).words; } catch { /* ignore */ } }
  });
  await page.goto(`${base}/login`);
  await page.fill('#cc', 'DEMO5A');
  await noHScroll(page, `${tag} login`);
  await page.getByRole('button', { name: /Next/ }).click();
  await page.locator('button.btn-tall', { hasText: 'Riya' }).click();
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByText("Start today's words").waitFor();
  await noHScroll(page, `${tag} home`);
  await page.getByText("Start today's words").click();
  await page.locator('.stage-banner').first().waitFor();
  assert(words && words.length === 5, `${tag}: expected 5 words, got ${words?.length}`);

  for (let i = 0; i < 5; i++) {
    const w = words[i];
    // stage 1: spell
    await page.locator('.stage-spell').waitFor();
    await noHScroll(page, `${tag} w${i} spell`); await noTextInputs(page, `${tag} w${i} spell`);
    if (i === 0) { // one wrong attempt first, then fix it
      await typeText(page, 'zz');
      await page.locator('.osk-submit').click();
      await page.getByText(/Almost/).first().waitFor();
      for (let k = 0; k < 2; k++) await page.locator('button[aria-label="backspace"]').click();
    }
    await typeText(page, w.word.slice(i === 0 ? 0 : 0));
    await noHScroll(page, `${tag} w${i} spell typed`);
    await page.locator('.osk-submit').click();
    // stage 2a: learn
    await page.locator('.stage-learn').waitFor({ timeout: 8000 });
    await noHScroll(page, `${tag} w${i} learn`);
    const next = page.getByRole('button', { name: /Next/ });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /Next/.test(b.textContent) && !b.disabled), null, { timeout: 8000 });
    await next.click();
    // stage 2b: meaning check
    await page.locator('button.option').first().waitFor();
    await noHScroll(page, `${tag} w${i} check`);
    await page.locator('button.option', { hasText: w.meaning }).first().click();
    await page.getByRole('button', { name: /Next/ }).click();
    // stage 3: write
    await page.locator('.stage-write').waitFor();
    await noHScroll(page, `${tag} w${i} write`); await noTextInputs(page, `${tag} w${i} write`);
    await typeText(page, `The ${w.word} is very nice today.`);
    await noHScroll(page, `${tag} w${i} write typed`); await noTextInputs(page, `${tag} w${i} write typed`);
    await page.getByRole('button', { name: /^Check/ }).click();
    await page.getByRole('list', { name: 'feedback' }).waitFor({ timeout: 15000 });
    await noHScroll(page, `${tag} w${i} write result`);
    await page.getByRole('button', { name: i === 4 ? /Finish/ : /Next word/ }).click();
  }
  await page.waitForURL(/summary/, { timeout: 20000 });
  await page.getByText(/XP|marks|score/i).first().waitFor();
  await noHScroll(page, `${tag} summary`);
  console.log(`  student flow ${tag}: ok`);
  await ctx.close();
}

async function teacherFlow(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(`${base}/teacher/login`);
  await page.fill('input[type=email]', 'demo@school.test');
  await page.fill('input[type=password]', 'demo1234');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('heading', { name: /Today/ }).waitFor({ timeout: 15000 });
  await page.locator('td', { hasText: 'Riya' }).first().waitFor();
  assert(await page.getByText(/1\/10 completed/).count() === 1, 'dashboard should show 1/10 completed');
  console.log('  teacher dashboard: ok');
  await page.getByRole('link', { name: 'Analytics' }).click();
  await page.getByRole('heading', { name: /class analytics/i }).waitFor();
  await page.locator('td', { hasText: 'Riya' }).first().waitFor();
  console.log('  teacher analytics: ok');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /attempts CSV/ }).click()]);
  const file = await dl.path();
  const csv = readFileSync(file, 'utf8');
  assert(csv.split('\n').length > 2, 'CSV has no data rows');
  assert(/spell|word/i.test(csv.split('\n')[0]), 'CSV header missing');
  console.log(`  csv download (${dl.suggestedFilename()}, ${csv.length} bytes): ok`);
  await page.locator('td', { hasText: 'Riya' }).first().click();
  await page.waitForURL(/\/teacher\/students\/\d+/);
  await page.getByRole('heading', { name: /Riya/ }).waitFor();
  console.log('  teacher student detail: ok');
  await ctx.close();
}

async function main() {
  const browser = await pw.chromium.launch({ headless: !process.env.HEADED });
  try {
    for (const vp of [{ width: 320, height: 640 }, { width: 412, height: 915 }]) {
      const { base, name, cleanup } = await startStack();
      try {
        console.log(`scenario ${vp.width}x${vp.height} (fresh DB ${name}${PROD ? ', prod bundle' : ''})`);
        await studentFlow(browser, base, vp);
        if (vp.width === 412) await teacherFlow(browser, base);
      } finally { await cleanup(); }
    }
    console.log(`E2E PASSED (${checks} assertions)`);
  } finally { await browser.close(); killAll(); }
}
main().catch((e) => { console.error(e); killAll(); process.exit(1); });
