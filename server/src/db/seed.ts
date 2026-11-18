/**
 * Seeding. OWNER: Lane A (server).
 */
import type { DB } from './db.ts';

/**
 * Upsert every entry of content/words/part-*.json into `words` (source='bank').
 * Idempotent (INSERT ... ON CONFLICT(id) DO UPDATE). Missing/empty files are skipped with a warning,
 * so the server boots before content exists. Returns the number of words loaded.
 */
export function loadWordBank(db: DB, contentDir: string): number {
  void db; void contentDir;
  console.warn('[seed] loadWordBank not implemented yet');
  return 0;
}

/**
 * Dev seed when SEED_DEMO=1 and no teachers exist:
 * teacher demo@school.test / demo1234, class '5A' code 'DEMO5A' (startDate = today IST),
 * 10 students roll 1-10 (Riya, Aarav, Kabir, Sai, Ananya, Om, Isha, Vedant, Gauri, Arjun), all with PIN '1234'.
 * Real classes get random PINs from generatePin().
 */
export function seedDemo(db: DB): void {
  void db;
  console.warn('[seed] seedDemo not implemented yet');
}
