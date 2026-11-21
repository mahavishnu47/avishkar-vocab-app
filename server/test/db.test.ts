import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, isUniqueViolation, migrate, poolConfig, pooledUrl, toPgSql, type DB } from '../src/db/db.ts';
import { loadWordBank, seedDemo } from '../src/db/seed.ts';
import { closeTestDb, setup, testDb } from './helpers.ts';

let db: DB;
let schoolId: number;
beforeEach(async () => {
  await setup();
  db = testDb();
  schoolId = Number((await db.run("INSERT INTO schools (name, student_code) VALUES ('S', 'TESTSC') RETURNING id")).rows[0]!.id);
});
afterAll(closeTestDb);

describe('placeholders', () => {
  it('converts ? to $n outside literals, quotes and comments', () => {
    expect(toPgSql('SELECT ? , ?')).toBe('SELECT $1 , $2');
    expect(toPgSql("SELECT '?' , ?, 'it''s ?', \"a?b\" -- why?\n, ?")).toBe("SELECT '?' , $1, 'it''s ?', \"a?b\" -- why?\n, $2");
  });
  it('binds params end to end', async () => {
    expect((await db.get<{ s: string }>("SELECT ? || '?' AS s", ['a']))!.s).toBe('a?');
  });
});

describe('types', () => {
  it('COUNT and SUM come back as numbers', async () => {
    const r = await db.get<{ n: unknown; s: unknown; a: unknown }>('SELECT COUNT(*) AS n, SUM(difficulty) AS s, AVG(difficulty) AS a FROM words');
    expect(typeof r!.n).toBe('number');
    expect(typeof r!.s).toBe('number');
    expect(typeof r!.a).toBe('number');
    expect(r!.n).toBeGreaterThan(0);
  });
  it('iso_now() default produces ISO-8601 text', async () => {
    const t = await db.run("INSERT INTO teachers (name, email, password_hash, school_id) VALUES ('a','a@b.c','x', ?) RETURNING id, created_at", [schoolId]);
    expect(t.rows[0]!.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });
});

describe('tx', () => {
  const add = (q: Pick<DB, 'run'>, email: string) => q.run("INSERT INTO teachers (name, email, password_hash, school_id) VALUES ('t', ?, 'x', ?) RETURNING id", [email, schoolId]);
  const count = async () => (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM teachers'))!.n;

  it('commits and returns the value', async () => {
    const id = await db.tx(async (q) => (await add(q, 'c@x.in')).rows[0]!.id);
    expect(typeof id).toBe('number');
    expect(await count()).toBe(1);
  });
  it('rolls back on throw and rethrows', async () => {
    await expect(db.tx(async (q) => { await add(q, 'r@x.in'); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await count()).toBe(0);
  });
  it('nested tx reuses the outer transaction (flat)', async () => {
    await expect(
      db.tx(async (q) => {
        await q.tx(async (q2) => { await add(q2, 'n@x.in'); });
        expect(await q.get('SELECT 1 FROM teachers')).toBeDefined(); // visible inside
        throw new Error('outer fails');
      }),
    ).rejects.toThrow('outer fails');
    expect(await count()).toBe(0); // inner work rolled back with outer
  });
  it('rolls back on a unique violation, which isUniqueViolation recognises', async () => {
    await add(db, 'dup@x.in');
    let err: unknown;
    try { await db.tx(async (q) => { await add(q, 'DUP@x.in'); }); } catch (e) { err = e; }
    expect(isUniqueViolation(err)).toBe(true);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(await count()).toBe(1);
  });
  it('does not leak connections after failures', async () => {
    const tiny = createDb(process.env.DATABASE_URL!, { max: 1 });
    for (let i = 0; i < 3; i++) await expect(tiny.tx(async (q) => { await q.exec('SELECT 1'); throw new Error('x'); })).rejects.toThrow('x');
    await expect(tiny.tx(async (q) => q.get('SELECT 1 AS one'))).resolves.toEqual({ one: 1 });
    await tiny.end();
  });
});

describe('migrate', () => {
  it('is idempotent and records versions', async () => {
    expect(await migrate(db)).toEqual([]);
    const v = await db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(v.map((r) => r.version)).toEqual([1, 2, 3]);
  });
  it('serialises concurrent runs on a fresh database', async () => {
    const name = `shabd_mig_${process.pid}`;
    const admin = createDb(process.env.TEST_ADMIN_URL!, { max: 1 });
    await admin.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.exec(`CREATE DATABASE ${name}`);
    const u = new URL(process.env.TEST_ADMIN_URL!);
    u.pathname = `/${name}`;
    const a = createDb(u.toString(), { max: 2 });
    const b = createDb(u.toString(), { max: 2 });
    const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
    expect([ra.length, rb.length].sort()).toEqual([0, 3]);
    await a.end();
    await b.end();
    await admin.exec(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  });
  it('email uniqueness is case-insensitive; teacher_word_seq exists', async () => {
    await db.run("INSERT INTO teachers (name, email, password_hash, school_id) VALUES ('a','A@x.in','x', ?)", [schoolId]);
    await expect(db.run("INSERT INTO teachers (name, email, password_hash, school_id) VALUES ('b','a@X.IN','x', ?)", [schoolId])).rejects.toSatisfy(isUniqueViolation);
    expect((await db.get<{ v: number }>("SELECT nextval('teacher_word_seq') AS v"))!.v).toBe(1);
  });
});

describe('url handling', () => {
  it('rewrites direct neon hosts to the pooler and strips sslmode', () => {
    expect(pooledUrl('postgres://u:p@ep-cool-1.ap-southeast-1.aws.neon.tech/shabd?sslmode=require')).toContain('ep-cool-1-pooler.ap-southeast-1');
    expect(pooledUrl('postgres://u:p@ep-cool-1-pooler.x.neon.tech/shabd')).toContain('ep-cool-1-pooler.x');
    const c = poolConfig('postgres://u:p@ep-1-pooler.x.neon.tech/shabd?sslmode=require');
    expect(c.connectionString).not.toContain('sslmode');
    expect(c.ssl).toEqual({ rejectUnauthorized: true });
    expect(c.max).toBe(3);
    expect(c.connectionTimeoutMillis).toBe(10_000);
    expect(poolConfig('postgres://u@localhost/x').ssl).toBeUndefined();
    expect(poolConfig('postgres://u@localhost/x').max).toBe(10);
  });
});

describe('seeds', () => {
  const entry = (id: string, day: number, word: string, meaning = 'a thing here') => ({
    id, dayIndex: day, word, partOfSpeech: 'noun', difficulty: 1, meaning, meaningMarathi: 'x',
    exampleSentence: `The ${word} is here today.`, distractorMeanings: ['one thing', 'two thing'], syllables: [word], tags: ['home'], contextWords: ['a', 'b', 'c'],
  });
  it('loadWordBank is idempotent, skips bad/underscore files, updates in place, fixture only when allowed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bank-'));
    writeFileSync(join(dir, 'part-01.json'), JSON.stringify([entry('d001-1', 1, 'apple'), entry('bad', 1, 'x'), entry('d001-2', 1, 'mango')]));
    writeFileSync(join(dir, 'part-02.json'), '{ not json');
    writeFileSync(join(dir, '_example.json'), JSON.stringify([entry('d300-1', 300, 'ghost')]));
    await db.exec('DELETE FROM words');
    expect(await loadWordBank(db, dir)).toBe(2);
    expect(await loadWordBank(db, dir)).toBe(2);
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM words'))!.n).toBe(2);
    writeFileSync(join(dir, 'part-01.json'), JSON.stringify([entry('d001-1', 1, 'apple', 'changed meaning')]));
    await loadWordBank(db, dir);
    expect((await db.get<{ meaning: string }>("SELECT meaning FROM words WHERE id = 'd001-1'"))!.meaning).toBe('changed meaning');
    // empty bank: no fixture without the flag
    await db.exec('DELETE FROM words');
    expect(await loadWordBank(db, '/nonexistent')).toBe(0);
    expect(await loadWordBank(db, '/nonexistent', { allowFixture: true })).toBeGreaterThan(0);
  });
  it('seeds more than one chunk (>200 words)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bank-'));
    const many = Array.from({ length: 450 }, (_, i) => entry(`d${String(Math.floor(i / 5) + 1).padStart(3, '0')}-${(i % 5) + 1}`, Math.floor(i / 5) + 1, 'word'));
    writeFileSync(join(dir, 'part-01.json'), JSON.stringify(many));
    await db.exec('DELETE FROM words');
    expect(await loadWordBank(db, dir)).toBe(450);
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM words'))!.n).toBe(450);
  });
  it('seedDemo is idempotent and refuses in production', async () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      await expect(seedDemo(db)).rejects.toThrow(/production/);
      expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM teachers'))!.n).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prev;
    }
    await db.exec('TRUNCATE schools CASCADE');
    expect(await seedDemo(db)).toBe(true);
    expect(await seedDemo(db)).toBe(false);
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM students'))!.n).toBe(10);
    const t = await db.get<{ role: string; school_id: number }>("SELECT role, school_id FROM teachers WHERE email = 'demo@school.test'");
    expect(t!.role).toBe('school_admin');
    expect((await db.get<{ student_code: string }>('SELECT student_code FROM schools WHERE id = ?', [t!.school_id]))!.student_code).toBe('DEMSCH');
    expect((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM invites WHERE code = 'TEACHERS' AND kind = 'teacher'"))!.n).toBe(1);
    const c = await db.get<{ standard: number; division: string; class_code: string }>("SELECT standard, division, class_code FROM classes");
    expect(c).toEqual({ standard: 5, division: 'A', class_code: 'DEMO5A' });
  });
});

describe('migration v2 backfill (v1 database with data)', () => {
  it('moves legacy data into a default school and is a no-op the second time', async () => {
    const name = `shabd_mig2_${process.pid}`;
    const admin = createDb(process.env.TEST_ADMIN_URL!, { max: 1 });
    await admin.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.exec(`CREATE DATABASE ${name}`);
    const u = new URL(process.env.TEST_ADMIN_URL!);
    u.pathname = `/${name}`;
    const d = createDb(u.toString(), { max: 2 });
    try {
      const { MIGRATIONS } = await import('../src/db/migrations.ts');
      // apply v1 only, then insert legacy data
      await d.exec('CREATE TABLE schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at text NOT NULL DEFAULT now()::text)');
      await d.exec(MIGRATIONS[0]!.sql);
      await d.run("INSERT INTO schema_migrations (version, name) VALUES (1, 'initial schema')");
      await d.run("INSERT INTO teachers (name, email, password_hash) VALUES ('T1','t1@x.in','x'), ('T2','t2@x.in','x')");
      await d.run(`INSERT INTO classes (teacher_id, name, class_code, start_date) VALUES
        (1,'5A','AAAAAA','2026-06-01'), (1,'5 - b','BBBBBB','2027-01-10'), (2,'Maths club','CCCCCC','2026-05-31'), (2,'12c','DDDDDD','2026-07-01'), (2,'13A','EEEEEE','2026-07-01')`);
      await d.run("INSERT INTO students (class_id, roll_no, first_name, avatar, pin) VALUES (1,1,'Riya','x','1234'), (1,2,'Aarav','x','1234')");
      await d.run("INSERT INTO auth_tokens (token, role, student_id, expires_at, created_at) VALUES ('tok1','student',1,'2099-01-01','2026-06-02T00:00:00.000Z'), ('tok2','student',1,'2099-01-01','2026-06-09T00:00:00.000Z')");
      await d.run("INSERT INTO words (id, day_index, word, part_of_speech, difficulty, meaning, example_sentence, distractors_json, source, created_by) VALUES ('t-1', NULL, 'apple', 'noun', 1, 'm', 'e', '[]', 'teacher', 2)");

      expect((await migrate(d)).length).toBe(MIGRATIONS.length - 1); // every migration after v1

      const schools = await d.all<{ id: number; name: string }>('SELECT id, name FROM schools');
      expect(schools).toHaveLength(1);
      expect(schools[0]!.name).toBe('My School');
      const ts = await d.all<{ id: number; school_id: number; role: string }>('SELECT id, school_id, role FROM teachers ORDER BY id');
      expect(ts.map((t) => t.school_id)).toEqual([schools[0]!.id, schools[0]!.id]);
      expect(ts.map((t) => t.role)).toEqual(['school_admin', 'teacher']);
      const cs = await d.all<{ name: string; school_id: number; standard: number; division: string; academic_year: string }>(
        'SELECT name, school_id, standard, division, academic_year FROM classes ORDER BY id',
      );
      expect(cs.every((c) => c.school_id === schools[0]!.id)).toBe(true);
      expect(cs.map((c) => [c.standard, c.division, c.academic_year])).toEqual([
        [5, 'A', '2026-27'], [5, 'B', '2026-27'], [5, '', '2025-26'], [12, 'C', '2026-27'], [5, '', '2026-27'],
      ]);
      const sts = await d.all<{ first_login_at: string; last_login_at: string }>('SELECT first_login_at, last_login_at FROM students ORDER BY id');
      expect(sts[0]).toEqual({ first_login_at: '2026-06-02T00:00:00.000Z', last_login_at: '2026-06-09T00:00:00.000Z' });
      expect(sts[1]).toEqual({ first_login_at: null, last_login_at: null });
      expect((await d.get<{ school_id: number }>("SELECT school_id FROM words WHERE id = 't-1'"))!.school_id).toBe(schools[0]!.id);
      expect(await migrate(d)).toEqual([]);
      // an empty database gets no default school
    } finally {
      await d.end();
      await admin.exec(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    }
  });
  it('a fresh database has no default school', async () => {
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM schools'))!.n).toBe(1); // only the one beforeEach made
    const cols = await db.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'invites'");
    expect(cols.map((c) => c.column_name)).toContain('use_count');
  });
});
