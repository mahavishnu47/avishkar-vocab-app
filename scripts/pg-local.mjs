#!/usr/bin/env node
/**
 * Throwaway local Postgres for tests/dev (no Docker needed).
 *   node scripts/pg-local.mjs start|stop|url
 * Finds initdb/pg_ctl on PATH or /usr/lib/postgresql/*\/bin, keeps data in
 * $SHABD_PG_DIR (default $TMPDIR/shabd-pg-<uid>), listens on 127.0.0.1:$SHABD_PG_PORT (default 54329), trust auth.
 * As root it runs everything through `su postgres` (initdb refuses root). Idempotent.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, chownSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const uid = process.getuid?.() ?? 0;
const port = process.env.SHABD_PG_PORT ?? '54329';
const dir = process.env.SHABD_PG_DIR ?? join(tmpdir(), `shabd-pg-${uid}`);
const data = join(dir, 'data');
const asRoot = uid === 0;
const url = `postgres://postgres@127.0.0.1:${port}/postgres`;

function findBin(name) {
  for (const p of (process.env.PATH ?? '').split(':')) if (p && existsSync(join(p, name))) return join(p, name);
  const root = '/usr/lib/postgresql';
  if (existsSync(root)) {
    for (const v of readdirSync(root).sort((a, b) => Number(b) - Number(a))) {
      const f = join(root, v, 'bin', name);
      if (existsSync(f)) return f;
    }
  }
  throw new Error(`${name} not found. Install PostgreSQL or run: docker run -d --name shabd-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16 and set TEST_DATABASE_URL.`);
}

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
function run(bin, args) {
  if (asRoot) return spawnSync('su', ['postgres', '-s', '/bin/sh', '-c', [bin, ...args].map(q).join(' ')], { encoding: 'utf8' });
  return spawnSync(bin, args, { encoding: 'utf8' });
}
function must(r, what) {
  if (r.status !== 0) throw new Error(`${what} failed: ${r.stderr || r.stdout}`);
  return r;
}
const running = () => run(findBin('pg_ctl'), ['-D', data, 'status']).status === 0;

function start() {
  if (!running()) {
    mkdirSync(dir, { recursive: true });
    if (asRoot) {
      const pw = execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).trim();
      chownSync(dir, Number(pw), Number(execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).trim()));
    }
    if (!existsSync(join(data, 'PG_VERSION'))) {
      must(run(findBin('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-sync']), 'initdb');
    }
    must(
      run(findBin('pg_ctl'), ['-D', data, '-l', join(dir, 'pg.log'), '-w', '-o', `-p ${port} -h 127.0.0.1 -k ${dir} -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=100`, 'start']),
      'pg_ctl start',
    );
  }
  console.log(url);
}
function stop() {
  if (running()) must(run(findBin('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']), 'pg_ctl stop');
  console.log('stopped');
}

const cmd = process.argv[2];
try {
  if (cmd === 'start') start();
  else if (cmd === 'stop') stop();
  else if (cmd === 'url') console.log(url);
  else { console.error('usage: pg-local.mjs start|stop|url'); process.exit(2); }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
