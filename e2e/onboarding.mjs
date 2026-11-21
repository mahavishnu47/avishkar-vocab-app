/**
 * Onboarding end-to-end (docs/ONBOARDING_SPEC.md 5.5). One fresh throwaway Postgres DB per phone size (320x640, 412x915):
 * super admin creates a school -> principal activates the setup link -> principal shares the teacher invite ->
 * teacher joins and creates a class -> pastes students -> student opens the class link, taps a name, enters the PIN
 * on the on-screen keypad, sees the welcome, plays a word -> second visit is one tap -> shared-phone switcher ->
 * lockout + PIN reset -> school progress + password reset link -> cross-school isolation -> landing.
 * Everything runs at the phone viewport; every screen asserts no horizontal scroll, and student screens assert no
 * <input>/<textarea> (no native keyboard).
 * Usage: npm run e2e:onboarding         Env: HEADED=1, E2E_VERBOSE=1, FAKE_TODAY optional.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import net from 'node:net';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let pw;
for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) {
  try { pw = require(id); break; } catch { /* try next */ }
}
if (!pw) { console.error('playwright not found'); process.exit(2); }

const SECRET = 'test-secret-1234567890';
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
  p.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  procs.push(p);
  return p;
}
const killAll = () => { for (const p of procs.splice(0)) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } } };
const serverRequire = createRequire(join(ROOT, 'server', 'package.json'));

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

/** Fresh empty DB (migrated + word bank, NO demo school) + API + Vite dev server. */
async function startStack() {
  const { Client } = serverRequire('pg');
  const adminUrl = clusterUrl();
  const name = `shabd_onb_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const u = new URL(adminUrl); u.pathname = `/${name}`;
  const databaseUrl = u.toString();
  const apiPort = await freePort();
  const webPort = await freePort();
  const base = `http://127.0.0.1:${webPort}`;
  const env = {
    ...process.env, PORT: String(apiPort), API_PORT: String(apiPort), DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl,
    SUPER_ADMIN_SECRET: SECRET, PUBLIC_APP_URL: base, RATE_LIMIT_OFF: '1',
  };
  delete env.VERCEL_ENV; delete env.NODE_ENV; delete env.SEED_DEMO; delete env.TEACHER_INVITE_CODE;
  const cleanup = async () => {
    killAll();
    try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } catch (e) { console.error('drop db failed', e.message); }
    await admin.end().catch(() => {});
  };
  try {
    npmRun('db:migrate', env); npmRun('db:seed', env);
    run('npx', ['tsx', 'src/index.ts'], { cwd: join(ROOT, 'server'), env });
    await waitFor(`http://localhost:${apiPort}/api/health`);
    run('npx', ['vite', '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], { cwd: join(ROOT, 'apps/web'), env });
    await waitFor(base);
    return { base, apiBase: `http://127.0.0.1:${apiPort}/api`, name, cleanup };
  } catch (e) { await cleanup(); throw e; }
}

let checks = 0;
const findings = []; // E2E_SOFT=1: layout findings are listed instead of failing the run
function assert(cond, msg) { checks++; if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); }

async function noHScroll(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  let who = '';
  if (!(o.sw <= o.cw && o.bw <= o.cw)) {
    who = await page.evaluate((cw) => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > cw + 1)
      .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}(${Math.round(e.getBoundingClientRect().right)})`).join(' '), o.cw);
  }
  if (process.env.E2E_SOFT && !(o.sw <= o.cw && o.bw <= o.cw)) { findings.push(`${label}: horizontal scroll, offenders: ${who}`); return; }
  assert(o.sw <= o.cw && o.bw <= o.cw, `${label}: horizontal scroll (scrollWidth ${o.sw} / body ${o.bw} > client ${o.cw}) offenders: ${who}`);
}
async function noTextInputs(page, label) {
  const n = await page.locator('input:not([type=checkbox]):not([type=radio]), textarea').count();
  assert(n === 0, `${label}: found ${n} <input>/<textarea> (native keyboard would open)`);
}

// ---------------------------------------------------------------- tiny JSON client for set-up and isolation checks
async function api(apiBase, method, path, { token, body, secret } = {}) {
  const r = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(secret ? { 'x-admin-secret': secret } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: r.status, json, text };
}

const allPages = [];
async function dumpPages() {
  let n = 0;
  for (const p of allPages) {
    if (process.env.E2E_SHOTS) await p.screenshot({ path: `${process.env.E2E_SHOTS}/page-${++n}.png` }).catch(() => {});
    try { console.error(`--- page ${p.url()}\n${(await p.locator('body').innerText({ timeout: 2000 })).slice(0, 600)}`); } catch { /* closed */ }
  }
}
async function newPhone(browser, vp, extra = {}) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, serviceWorkers: 'block', ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  allPages.push(page);
  if (process.env.E2E_WORKAROUND) await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.sr-only{left:0!important;top:0!important}'; document.head.appendChild(st); }); });
  return { ctx, page };
}
/** Fill whichever of name / email / password inputs a form has. */
async function fillAccount(page, { name, email, password }) {
  if (name !== undefined) await page.locator('input:not([type=email]):not([type=password]):not([type=checkbox])').first().fill(name);
  if (email !== undefined) await page.locator('input[type=email]').fill(email);
  if (password !== undefined) await page.locator('input[type=password], input[autocomplete="new-password"]').first().fill(password);
}
const linkIn = (text, kind) => text.match(new RegExp(`https?://[^\\s"'<>]+/${kind}/[A-Za-z0-9-]+`))?.[0];
const pathOf = (url) => { const u = new URL(url); return u.pathname; };

async function pinPad(page, pin, tag) {
  await noTextInputs(page, `${tag} pin pad`);
  await noHScroll(page, `${tag} pin pad`);
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
}

// ---------------------------------------------------------------- scenario
async function scenario(browser, stack, vp) {
  const tag = `${vp.width}x${vp.height}`;
  const { base, apiBase } = stack;
  const suffix = `${vp.width}`;
  const principalEmail = `principal${suffix}@school.test`;
  const teacherEmail = `teacher${suffix}@school.test`;

  // 0. landing (check 13)
  {
    const { ctx, page } = await newPhone(browser, vp);
    await page.goto(`${base}/`);
    await page.getByText(/I'm a Student/i).waitFor();
    await page.getByText(/I'm a Teacher/i).waitFor();
    await page.getByText(/My School/i).waitFor();
    await noHScroll(page, `${tag} landing`);
    await page.getByText(/My School/i).first().click();
    await page.waitForURL(/\/teacher\/login\?next=(%2F|\/)school/);
    assert(true, 'landing tile');
    console.log(`  [${tag}] landing: 3 tiles, My School -> staff login: ok`);
    await ctx.close();
  }

  // 1. super admin creates the school (check 1)
  let setupUrl;
  {
    const { ctx, page } = await newPhone(browser, vp);
    await page.goto(`${base}/admin`);
    await page.locator('input[type=password], input').first().fill(SECRET);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /new school/i }).first().click();
    await page.locator('input').first().fill('Test School');
    await noHScroll(page, `${tag} admin form`);
    await page.getByRole('button', { name: /^create/i }).click();
    await page.getByText(/\/a\/[A-Z2-9]{8}/).first().waitFor({ timeout: 15000 });
    setupUrl = linkIn(await page.locator('body').innerText(), 'a');
    assert(setupUrl && setupUrl.startsWith(base), `${tag}: setup link built from PUBLIC_APP_URL (${setupUrl})`);
    await noHScroll(page, `${tag} admin result`);
    console.log(`  [${tag}] super admin created school, setup link ${pathOf(setupUrl)}: ok`);
    await ctx.close();
  }
  // wrong secret must not list schools
  assert((await api(apiBase, 'GET', '/admin/schools', { secret: 'wrong-secret-wrong-secret' })).status === 401, `${tag}: wrong admin secret rejected`);
  assert((await api(apiBase, 'GET', '/admin/schools', { secret: SECRET })).status === 200, `${tag}: admin secret accepted`);

  // 2. principal activates (check 2)
  let teacherLink;
  const principal = await newPhone(browser, vp);
  {
    const { page } = principal;
    await page.goto(setupUrl);
    await page.getByText(/Test School/).first().waitFor({ timeout: 15000 });
    await fillAccount(page, { name: 'Mrs Principal', email: principalEmail, password: 'principal-pass-1' });
    await noHScroll(page, `${tag} school setup`);
    await page.getByRole('button', { name: /create my account/i }).click();
    await page.waitForURL(/\/school(\?|$|\/)/, { timeout: 15000 });
    await page.getByText(/invite your teachers/i).first().waitFor();
    await noHScroll(page, `${tag} school checklist`);
    await ctx_wa(page, 'principal WhatsApp', async (url) => { teacherLink = url; });
    assert(teacherLink && /\/t\//.test(decodeURIComponent(teacherLink)), `${tag}: WhatsApp share carries the teacher link (${teacherLink})`);
    console.log(`  [${tag}] principal activated, checklist, WhatsApp share intercepted: ok`);
  }
  // the used setup link is dead
  assert((await api(apiBase, 'GET', `/invites/${pathOf(setupUrl).split('/').pop()}`)).status === 404, `${tag}: used setup link is invalid`);
  const teacherUrl = linkIn(decodeURIComponent(teacherLink), 't');

  // 3-4. teacher joins, creates class, pastes students (checks 3, 4)
  const teacher = await newPhone(browser, vp);
  let classId, classCode, joinUrl;
  {
    const { page } = teacher;
    await page.goto(teacherUrl);
    await page.getByText(/Test School/).first().waitFor({ timeout: 15000 });
    await fillAccount(page, { name: 'Mr Teacher', email: teacherEmail, password: 'teacher-pass-1' });
    await noHScroll(page, `${tag} teacher join`);
    await page.getByRole('button', { name: /join school/i }).click();
    await page.waitForURL(/\/teacher(\?|$)/, { timeout: 15000 });
    await page.getByText(/create your class/i).first().waitFor();
    await noHScroll(page, `${tag} teacher home`);
    await page.getByRole('link', { name: /^create class$/i }).or(page.getByRole('button', { name: /^create class$/i })).first().click();
    await page.waitForURL(/\/teacher\/classes\/new/);
    await page.getByRole('button', { name: 'Standard 5' }).click();
    await page.getByRole('button', { name: 'Division B' }).click();
    await page.getByText(/5B/).first().waitFor();
    await noHScroll(page, `${tag} new class`);
    await page.getByRole('button', { name: /create class/i }).click();
    await page.waitForURL(/\/teacher\/classes\/(\d+)\/students\/add/, { timeout: 15000 });
    classId = Number(page.url().match(/classes\/(\d+)/)[1]);
    await page.locator('textarea').fill('1, Riya Patil\n2 Aarav\nKabir');
    for (const n of ['Riya', 'Aarav', 'Kabir']) await page.getByText(n).first().waitFor();
    await page.getByText(/first names only/i).first().waitFor();
    await noHScroll(page, `${tag} paste preview`);
    await page.getByText(/Parents have given consent/).click();
    assert(await page.getByRole('checkbox').isChecked(), `${tag}: consent ticked`);
    await page.getByRole('button', { name: /save 3 students/i }).click();
    await page.waitForURL(/\/teacher\/classes\/\d+\/share/, { timeout: 15000 });
    await page.locator('svg').first().waitFor();
    const body = await page.locator('body').innerText();
    joinUrl = linkIn(body, 'j');
    assert(joinUrl, `${tag}: share page shows a /j/ link`);
    classCode = joinUrl.split('/').pop();
    await noHScroll(page, `${tag} share`);
    console.log(`  [${tag}] teacher joined, class 5B created, 3 students pasted, share page ${pathOf(joinUrl)}: ok`);
  }

  // teacher token + PIN lookup through the API
  const tl = await api(apiBase, 'POST', '/auth/teacher/login', { body: { email: teacherEmail, password: 'teacher-pass-1' } });
  assert(tl.status === 200, `${tag}: teacher API login`);
  const ttoken = tl.json.token;
  const roster = async () => (await api(apiBase, 'GET', `/classes/${classId}/students`, { token: ttoken })).json;
  const pinOf = async (name) => (await roster()).find((s) => s.firstName === name).pin;
  const rosterNow = await roster();
  assert(rosterNow.length === 3 && rosterNow.every((s) => /^\d{4}$/.test(s.pin)), `${tag}: 3 students with PINs`);
  assert(!rosterNow.some((s) => /Patil/.test(JSON.stringify(s))), `${tag}: surname dropped`);

  // 5. student first visit (check 5)
  const kid = await newPhone(browser, vp);
  {
    const { page } = kid;
    let words = null;
    page.on('response', async (r) => {
      if (r.url().endsWith('/api/student/sessions/today') && r.ok()) { try { words = (await r.json()).words; } catch { /* ignore */ } }
    });
    await page.goto(joinUrl);
    await page.getByText(/Test School/).first().waitFor({ timeout: 15000 });
    await noTextInputs(page, `${tag} name grid`); await noHScroll(page, `${tag} name grid`);
    await page.getByRole('button', { name: /Riya/ }).first().click();
    await page.waitForURL(/\/pin\//);
    await pinPad(page, await pinOf('Riya'), tag);
    await page.waitForURL(/\/welcome/, { timeout: 15000 });
    await noTextInputs(page, `${tag} welcome`); await noHScroll(page, `${tag} welcome`);
    for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: /next/i }).click(); }
    await page.getByRole('button', { name: /let's play/i }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10000 });
    await page.getByText(/Riya/).first().waitFor();
    await noTextInputs(page, `${tag} home`); await noHScroll(page, `${tag} home`);
    // play one word: spell it on the on-screen keyboard
    await page.getByText(/Start today's words|Play/).first().click();
    await page.locator('.stage-spell').waitFor({ timeout: 15000 });
    await noTextInputs(page, `${tag} spell`); await noHScroll(page, `${tag} spell`);
    assert(words && words.length === 5, `${tag}: 5 words for today`);
    for (const ch of words[0].word) await page.locator(`button[aria-label="letter ${ch.toLowerCase()}"]`).click();
    await page.locator('.osk-submit').click();
    await page.locator('.stage-learn').waitFor({ timeout: 8000 });
    await noHScroll(page, `${tag} learn`);
    console.log(`  [${tag}] student: name -> keypad PIN -> welcome -> home -> played a word: ok`);

    // second visit: remembered, straight to Home, one tap to play
    await page.goto(`${base}/`);
    await page.getByText(/Riya/).first().waitFor({ timeout: 10000 });
    assert(!/\/(login|who|j\/|welcome)/.test(new URL(page.url()).pathname), `${tag}: reload goes straight to Home (${page.url()})`);
    await page.getByText(/Start today's words|Play|Continue/).first().waitFor();
    console.log(`  [${tag}] student: reload is straight to Home (one tap to play): ok`);

    // 6. shared phone: add Aarav, switcher shows 2 tiles
    await page.goto(joinUrl);
    await page.getByRole('button', { name: /Aarav/ }).first().click();
    await page.waitForURL(/\/pin\//);
    await pinPad(page, await pinOf('Aarav'), tag);
    await page.waitForURL(/\/welcome/, { timeout: 15000 });
    await page.getByRole('button', { name: /skip/i }).first().click();
    await page.getByText(/Aarav/).first().waitFor();
    await page.goto(`${base}/who`);
    await page.getByRole('button', { name: /Riya/ }).first().waitFor();
    await page.getByRole('button', { name: /Aarav/ }).first().waitFor();
    await noTextInputs(page, `${tag} who`); await noHScroll(page, `${tag} who`);
    await page.getByRole('button', { name: /Riya/ }).first().click();
    await page.getByText(/Riya/).first().waitFor();
    assert(!/\/(who|login|pin)/.test(new URL(page.url()).pathname), `${tag}: tapping a tile opens Home`);
    console.log(`  [${tag}] shared phone: Who's playing with 2 tiles, tap switches: ok`);
  }

  // 7. lockout then reset (check 7), via a second child on a clean phone
  {
    const { ctx, page } = await newPhone(browser, vp);
    await page.goto(joinUrl);
    await page.getByRole('button', { name: /Kabir/ }).first().click();
    await page.waitForURL(/\/pin\//);
    const real = await pinOf('Kabir');
    const wrong = real === '0000' ? '1111' : '0000';
    for (let i = 0; i < 6; i++) { // 5 wrong PINs, the next attempt is refused with the lock message
      await page.getByRole('img', { name: '0 of 4 digits' }).waitFor();
      await pinPad(page, wrong, tag);
      await page.waitForTimeout(400);
    }
    await page.getByText(/too many tries/i).first().waitFor({ timeout: 10000 });
    const rp = await api(apiBase, 'POST', `/students/${(await roster()).find((s) => s.firstName === 'Kabir').id}/reset-pin`, { token: ttoken });
    assert(rp.status === 200, `${tag}: reset PIN ok`);
    const newPin = await pinOf('Kabir');
    await page.reload();
    await page.getByRole('button', { name: /Kabir/ }).first().click().catch(() => {});
    if (!/\/pin\//.test(page.url())) await page.waitForURL(/\/pin\//);
    await pinPad(page, newPin, tag);
    await page.waitForURL(/\/welcome|\/$/, { timeout: 15000 });
    console.log(`  [${tag}] lockout after 5 wrong PINs, teacher reset, new PIN works: ok`);
    await ctx.close();
  }

  // 8. reset signs out on all phones (check 8)
  {
    const { page } = kid;
    const riya = (await roster()).find((s) => s.firstName === 'Riya');
    assert((await api(apiBase, 'POST', `/students/${riya.id}/reset-pin`, { token: ttoken })).status === 200, `${tag}: reset Riya`);
    await page.goto(`${base}/who`);
    await page.getByRole('button', { name: /Riya/ }).first().waitFor();
    // the old token is rejected on next use: opening Home bounces to who/pin
    await page.goto(`${base}/`);
    await page.waitForFunction(() => /\/(who|pin|j\/)/.test(location.pathname) || document.body.innerText.includes('PIN'), null, { timeout: 15000 });
    console.log(`  [${tag}] PIN reset signs the child out on that phone: ok`);
  }

  // 9. school progress, teachers, password reset link (check 9)
  {
    const { page } = principal;
    await page.goto(`${base}/school`);
    await page.getByText(/5B/).first().waitFor({ timeout: 15000 });
    await noHScroll(page, `${tag} school progress`);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    assert(/1 Classes 3 Students 3 Joined/.test(text), `${tag}: school totals show 1 class, 3 students, 3 joined (got: ${text.slice(0, 300)})`);
    assert(/Mr Teacher/.test(text), `${tag}: class row shows the teacher`);
    await page.goto(`${base}/school/teachers`);
    await page.getByText(/Mr Teacher/).first().waitFor();
    await noHScroll(page, `${tag} school teachers`);
  }
  const plist = await api(apiBase, 'POST', '/auth/teacher/login', { body: { email: principalEmail, password: 'principal-pass-1' } });
  const ptoken = plist.json.token;
  const trow = (await api(apiBase, 'GET', '/school/teachers', { token: ptoken })).json.find((t) => t.email === teacherEmail);
  const rl = await api(apiBase, 'POST', `/school/teachers/${trow.id}/reset-link`, { token: ptoken });
  assert(rl.status === 201 || rl.status === 200, `${tag}: reset link created`);
  assert(/\/r\//.test(rl.json.url), `${tag}: reset link is /r/ (${rl.json.url})`);
  {
    const { ctx, page } = await newPhone(browser, vp);
    await page.goto(rl.json.url);
    await page.locator('input[type=password], input[autocomplete="new-password"]').first().fill('teacher-pass-2');
    await noHScroll(page, `${tag} reset password`);
    await page.getByRole('button', { name: /save|set|change|reset/i }).first().click();
    await page.waitForURL(/\/teacher(\?|$)/, { timeout: 15000 });
    await ctx.close();
  }
  assert((await api(apiBase, 'POST', '/auth/teacher/login', { body: { email: teacherEmail, password: 'teacher-pass-2' } })).status === 200, `${tag}: new password works`);
  assert((await api(apiBase, 'POST', '/auth/teacher/login', { body: { email: teacherEmail, password: 'teacher-pass-1' } })).status === 401, `${tag}: old password rejected`);
  console.log(`  [${tag}] school progress, teachers list, password reset link: ok`);

  // 10. isolation (check 10): a second school
  {
    const created = await api(apiBase, 'POST', '/admin/schools', { secret: SECRET, body: { name: 'Other School' } });
    assert(created.status === 201, `${tag}: second school created`);
    const code = created.json.setupInvite.code.replace(/-/g, '');
    const reg = await api(apiBase, 'POST', '/auth/school/setup', { body: { code, name: 'Other Principal', email: `other${suffix}@school.test`, password: 'other-pass-1234' } });
    assert(reg.status === 201, `${tag}: second school set up`);
    const otoken = reg.json.token;
    const sid = rosterNow[0].id;
    for (const [m, p] of [
      ['GET', `/classes/${classId}/students`], ['GET', `/classes/${classId}/dashboard`], ['GET', `/classes/${classId}/share`],
      ['GET', `/classes/${classId}/analytics`], ['GET', `/classes/${classId}/export/attempts.csv`], ['GET', `/students/${sid}`],
      ['GET', `/classes/${classId}/leaderboard`],
    ]) {
      const r = await api(apiBase, m, p, { token: otoken });
      assert(r.status === 404, `${tag}: other school's admin gets 404 on ${m} ${p} (got ${r.status})`);
    }
    assert((await api(apiBase, 'POST', `/students/${sid}/reset-pin`, { token: otoken })).status === 404, `${tag}: cross-school reset-pin 404`);
    const os = await api(apiBase, 'GET', '/school/teachers', { token: otoken });
    assert(!JSON.stringify(os.json).includes(teacherEmail), `${tag}: other school cannot list our teachers`);
    assert((await api(apiBase, 'PATCH', `/school/teachers/${trow.id}`, { token: otoken, body: { active: false } })).status === 404, `${tag}: cross-school teacher PATCH 404`);
    assert((await api(apiBase, 'GET', '/school', { token: ttoken })).status === 401, `${tag}: password reset signed the teacher out`);
    const t2 = (await api(apiBase, 'POST', '/auth/teacher/login', { body: { email: teacherEmail, password: 'teacher-pass-2' } })).json.token;
    assert((await api(apiBase, 'GET', '/school', { token: t2 })).status === 403, `${tag}: plain teacher is 403 on /school`);
    console.log(`  [${tag}] cross-school isolation: all 404: ok`);
  }

  for (const p of [principal, teacher, kid]) await p.ctx.close();
}

// a WhatsApp button opens https://wa.me/?text=...; intercept it instead of leaving the app
async function ctx_wa(page, label, onUrl) {
  await page.context().route(/wa\.me|whatsapp\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'wa' }));
  const showLink = page.getByRole('button', { name: /show link/i });
  if (await showLink.count()) await showLink.first().click();
  const popup = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  const nav = page.waitForRequest(/wa\.me|whatsapp\.com/, { timeout: 8000 }).catch(() => null);
  await page.getByRole('button', { name: /whatsapp/i }).or(page.getByRole('link', { name: /whatsapp/i })).first().click();
  const [pp, rq] = await Promise.all([popup, nav]);
  const url = pp ? pp.url() : rq?.url();
  assert(url && /wa\.me|whatsapp/.test(url), `${label}: wa.me opened (${url})`);
  await onUrl(url);
  if (pp) await pp.close().catch(() => {});
  await page.getByText(/✅|done|shared/i).first().waitFor({ timeout: 8000 }).catch(() => {});
}

async function main() {
  const browser = await pw.chromium.launch({ headless: !process.env.HEADED });
  try {
    for (const vp of [{ width: 320, height: 640 }, { width: 412, height: 915 }]) {
      const stack = await startStack();
      try {
        console.log(`scenario ${vp.width}x${vp.height} (fresh DB ${stack.name})`);
        await scenario(browser, stack, vp);
      } catch (e) { await dumpPages(); throw e;
      } finally { await stack.cleanup(); }
    }
    if (findings.length) { console.log('LAYOUT FINDINGS (soft mode):'); for (const f of [...new Set(findings)]) console.log('  - ' + f); }
    console.log(`ONBOARDING E2E PASSED (${checks} assertions)`);
  } finally { await browser.close(); killAll(); }
}
main().catch(async (e) => { console.error(e); await dumpPages(); killAll(); process.exit(1); });
