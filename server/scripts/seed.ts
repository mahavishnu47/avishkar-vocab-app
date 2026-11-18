import { resolve } from 'node:path';
import { createDb, scriptDatabaseUrl } from '../src/db/db.ts';
import { loadWordBank } from '../src/db/seed.ts';

const db = createDb(scriptDatabaseUrl(), { max: 1 });
try {
  const loaded = await loadWordBank(db, resolve(import.meta.dirname, '../../content/words'), { allowFixture: process.argv.includes('--allow-fixture') });
  const n = (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM words WHERE source = 'bank'"))!.n;
  console.log(`[seed] upserted ${loaded} words; bank now has ${n}`);
} catch (e) {
  console.error('[seed] failed:', (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
