import { createDb, migrate, scriptDatabaseUrl } from '../src/db/db.ts';

const db = createDb(scriptDatabaseUrl(), { max: 1 });
try {
  const ran = await migrate(db);
  console.log(ran.length ? `[migrate] applied versions: ${ran.join(', ')}` : '[migrate] up to date');
} catch (e) {
  console.error('[migrate] failed:', (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
