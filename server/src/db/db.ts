/**
 * SQLite connection + migration runner. OWNER: Lane A (server).
 * better-sqlite3 is synchronous: fine for a 200-student pilot on one Node process.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MIGRATIONS } from './migrations.ts';

export type DB = Database.Database;

let instance: DB | null = null;

/** Open (and migrate) a database. Pass ':memory:' in tests. */
export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: DB): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => (r as { version: number }).version));
  const ran: number[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    })();
    ran.push(m.version);
  }
  return ran;
}

/** Process-wide DB (DB_PATH env, default ./data/shabd.db relative to server/). */
export function getDb(): DB {
  if (!instance) instance = openDb(process.env.DB_PATH ?? resolve(import.meta.dirname, '../../data/shabd.db'));
  return instance;
}

/** Test helper: inject a DB (e.g. openDb(':memory:')). */
export function setDb(db: DB): void {
  instance = db;
}
