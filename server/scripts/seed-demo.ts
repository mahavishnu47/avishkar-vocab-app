import { createDb, scriptDatabaseUrl } from '../src/db/db.ts';
import { seedDemo } from '../src/db/seed.ts';

const db = createDb(scriptDatabaseUrl(), { max: 1 });
try {
  const created = await seedDemo(db, { force: process.argv.includes('--force') });
  if (!created) console.log('[seed:demo] teachers already exist; nothing to do');
} catch (e) {
  console.error('[seed:demo]', (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
