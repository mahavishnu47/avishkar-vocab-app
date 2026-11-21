/**
 * Postgres access layer (node-postgres). OWNER: D1.
 * - One Pool per process in module scope (reused across warm serverless invocations).
 * - `?` placeholders are rewritten to $1..$n (outside quoted literals).
 * - bigint/numeric are parsed to JS numbers (COUNT/SUM must not come back as strings).
 * - Only unnamed statements are used, so Neon's PgBouncer (transaction mode) is safe.
 */
import pg from 'pg';
import { MIGRATIONS } from './migrations.ts';

pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // int8: COUNT/SUM
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric: AVG/SUM

export type Row = Record<string, unknown>;
export interface Queryable {
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** First row or undefined. */
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Use 'RETURNING id' to obtain generated ids (in `rows`). */
  run(sql: string, params?: unknown[]): Promise<{ rowCount: number; rows: Row[] }>;
  /** Multi-statement, no params (migrations). */
  exec(sql: string): Promise<void>;
  /** BEGIN/COMMIT/ROLLBACK on one pooled client. On a tx handle it reuses that tx (flat, no savepoints). */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}
export type DB = Queryable & { end(): Promise<void> };

export const LOCAL_DEFAULT_URL = 'postgres://postgres:postgres@localhost:5432/shabd';

/** Convert `?` placeholders to `$n`, leaving '...' and "..." literals and -- comments untouched. */
export function toPgSql(sql: string): string {
  let out = '';
  let n = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2; // doubled quote escape
          else break;
        } else j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === '-' && sql[i + 1] === '-') {
      const j = sql.indexOf('\n', i);
      const end = j === -1 ? sql.length : j;
      out += sql.slice(i, end);
      i = end;
    } else if (c === '?') {
      out += `$${++n}`;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '23505';
}

/** A *.neon.tech host without -pooler gets rewritten to the pooled host. */
export function pooledUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('.neon.tech') && !u.hostname.split('.')[0]!.endsWith('-pooler')) {
      const [first, ...rest] = u.hostname.split('.');
      u.hostname = [`${first}-pooler`, ...rest].join('.');
      return u.toString();
    }
  } catch { /* not a URL: leave it */ }
  return url;
}

function isLocalHost(host: string): boolean {
  return host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.startsWith('/');
}

/** Build pg PoolConfig from a connection string: strips sslmode, decides TLS, sizes the pool. */
export function poolConfig(url: string, opts: { max?: number } = {}): pg.PoolConfig {
  let host = '';
  let sslmode: string | null = null;
  let conn = url;
  try {
    const u = new URL(url);
    host = u.hostname;
    sslmode = u.searchParams.get('sslmode');
    u.searchParams.delete('sslmode');
    conn = u.toString();
  } catch { /* leave as is */ }
  const neon = host.endsWith('.neon.tech');
  const useSsl = process.env.PGSSLMODE !== 'disable' && !isLocalHost(host) && sslmode !== 'disable';
  const envMax = process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : undefined;
  return {
    connectionString: conn,
    max: opts.max ?? envMax ?? (neon ? 3 : 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: neon ? 10_000 : 5_000,
    allowExitOnIdle: true,
    ...(useSsl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

type Runner = { query: (text: string, params?: unknown[]) => Promise<pg.QueryResult> };

function wrap(runner: Runner, txImpl: Queryable['tx']): Queryable {
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      return (await runner.query(toPgSql(sql), params)).rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (await runner.query(toPgSql(sql), params)).rows[0] as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      const r = await runner.query(toPgSql(sql), params);
      return { rowCount: r.rowCount ?? 0, rows: r.rows as Row[] };
    },
    async exec(sql: string) {
      await runner.query(sql);
    },
    tx: txImpl,
  };
}

export function createDb(url: string, opts: { max?: number } = {}): DB {
  const pool = new pg.Pool(poolConfig(pooledUrl(url), opts));
  pool.on('error', (e) => console.error('[db] idle client error:', e.message));
  const base = wrap(pool, async <T>(fn: (q: Queryable) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      const handle: Queryable = wrap(client, (inner) => inner(handle)); // nested tx: reuse
      try {
        const result = await fn(handle);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
        throw e;
      }
    } finally {
      client.release(broken ? true : undefined);
    }
  });
  return { ...base, end: () => pool.end() };
}

/** URL for the app: DATABASE_URL or the local default. */
export function appDatabaseUrl(): string {
  return process.env.DATABASE_URL || LOCAL_DEFAULT_URL;
}
/** URL for migrate/seed scripts: prefers the direct (unpooled) Neon URL. */
export function scriptDatabaseUrl(): string {
  return process.env.DATABASE_URL_UNPOOLED || appDatabaseUrl();
}

/**
 * Local dev convenience (B-18): if the database named in a localhost URL does not exist yet, create it.
 * Never touches remote hosts; a no-op when the database is already there.
 */
export async function ensureLocalDatabase(url: string): Promise<void> {
  const u = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname)) return;
  const name = decodeURIComponent(u.pathname.slice(1));
  if (!name || !/^[A-Za-z0-9_]+$/.test(name)) return;
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const hit = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (hit.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`[server] created local database "${name}"`);
    }
  } finally {
    await client.end();
  }
}

let instance: DB | null = null;
/** Lazy module-scope singleton. */
export function getDb(): DB {
  if (!instance) instance = createDb(appDatabaseUrl());
  return instance;
}
/** Tests: inject a DB. */
export function setDb(db: DB): void {
  instance = db;
}

const ISO_NOW_SQL = `CREATE OR REPLACE FUNCTION iso_now() RETURNS text LANGUAGE sql VOLATILE AS $$ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$`;

/** Apply pending migrations in one transaction guarded by a transaction-scoped advisory lock. Returns applied versions. */
export async function migrate(db: DB): Promise<number[]> {
  return db.tx(async (q) => {
    await q.exec(`SELECT pg_advisory_xact_lock(hashtext('shabd_migrate'))`);
    await q.exec(ISO_NOW_SQL);
    await q.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY, name text NOT NULL, applied_at text NOT NULL DEFAULT iso_now())`);
    const applied = new Set((await q.all<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
    const ran: number[] = [];
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      await q.exec(m.sql);
      await q.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
      ran.push(m.version);
    }
    return ran;
  });
}
