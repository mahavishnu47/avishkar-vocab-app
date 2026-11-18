import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { getDb } from './db/db.ts';
import { loadWordBank, seedDemo } from './db/seed.ts';

const port = Number(process.env.PORT ?? 4000);
const db = getDb();
const loaded = loadWordBank(db, resolve(import.meta.dirname, '../../content/words'));
if (process.env.SEED_DEMO !== '0') seedDemo(db);

createApp().listen(port, () => {
  console.log(`[server] http://localhost:${port}/api  (words loaded: ${loaded}, AI evaluator: ${process.env.ANTHROPIC_API_KEY ? 'on' : 'off'})`);
});
