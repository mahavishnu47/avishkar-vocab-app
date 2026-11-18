/** Local dev/start entry (never imported by Vercel): migrate, seed bank, seed demo, listen. */
import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { getDb, migrate } from './db/db.ts';
import { loadWordBank, seedDemo } from './db/seed.ts';

const port = Number(process.env.PORT ?? 4000);
const db = getDb();
await migrate(db);
const loaded = await loadWordBank(db, resolve(import.meta.dirname, '../../content/words'), { allowFixture: true });
if (process.env.SEED_DEMO !== '0') await seedDemo(db);

createApp().listen(port, () => {
  console.log(`[server] http://localhost:${port}/api  (words loaded: ${loaded}, AI evaluator: ${process.env.ANTHROPIC_API_KEY ? 'on' : 'off'})`);
});
