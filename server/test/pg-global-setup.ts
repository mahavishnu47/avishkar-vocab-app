/** Vitest global setup: real Postgres. Recreates database shabd_test and migrates it; exports DATABASE_URL for workers. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { createDb, migrate } from '../src/db/db.ts';

const DOCKER_HINT = 'docker run -d --name shabd-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16  (then TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres)';

function adminUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const r = spawnSync('node', [resolve(import.meta.dirname, '../../scripts/pg-local.mjs'), 'start'], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`No Postgres for tests: set TEST_DATABASE_URL or start one. pg-local failed: ${r.stderr.trim()}\nTry: ${DOCKER_HINT}`);
  }
  return r.stdout.trim().split('\n').pop()!;
}

export default async function setup(): Promise<void> {
  const admin = new URL(adminUrl());
  const dbName = 'shabd_test';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await client.end();
  }
  const test = new URL(admin.toString());
  test.pathname = `/${dbName}`;
  process.env.DATABASE_URL = test.toString();
  process.env.TEST_ADMIN_URL = admin.toString();
  delete process.env.DATABASE_URL_UNPOOLED;
  const db = createDb(test.toString(), { max: 1 });
  try {
    await migrate(db);
  } finally {
    await db.end();
  }
}
