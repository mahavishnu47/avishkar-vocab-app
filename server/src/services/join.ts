/**
 * Public join lookups. A class is joinable when it is not archived, join is on and its school is active;
 * every other case is the same 404. Class codes are looked up as typed (uppercased), so legacy codes like DEMO5A work.
 */
import type { Queryable, Row } from '../db/db.ts';

export async function findJoinableClass(q: Queryable, code: string): Promise<Row | undefined> {
  return q.get(
    `SELECT c.* FROM classes c JOIN schools s ON s.id = c.school_id
      WHERE c.class_code = ? AND c.archived = 0 AND c.join_enabled = 1 AND s.status = 'active'`,
    [String(code).trim().toUpperCase()],
  );
}
