/**
 * Super admin CLI. Calls the same services as /api/admin.
 *   npm run admin -- create-school --name "ZP School Kalwa" [--district Thane] [--udise 27XXXXXXXXX]
 *   npm run admin -- setup-link --school <id>
 *   npm run admin -- list
 * Uses DATABASE_URL (DATABASE_URL_UNPOOLED preferred); links use PUBLIC_APP_URL (default http://localhost:5173).
 */
import { pathToFileURL } from 'node:url';
import { createDb, scriptDatabaseUrl, type Queryable } from '../src/db/db.ts';
import { baseUrl } from '../src/services/invites.ts';
import { createSchool, createSetupLink, listSchools, validateSchoolInput } from '../src/services/schools.ts';

function flags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`Missing value for ${a}`);
    out[a.slice(2)] = v;
    i++;
  }
  return out;
}

const USAGE = 'Usage: npm run admin -- create-school --name "<name>" [--district <d>] [--udise <11 digits>] | setup-link --school <id> | list';

/** Runs one command against `db`; returns the lines to print. Exported for tests. */
export async function runAdmin(db: Queryable, argv: string[]): Promise<string[]> {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  const base = baseUrl();
  if (cmd === 'create-school') {
    const v = validateSchoolInput(f.name, f.district, f.udise);
    const r = await createSchool(db, v, base);
    return [`School #${r.school.id} created: ${r.school.name} (student link ${base}/s/${r.school.studentCode})`, `Setup link: ${r.setupInvite.url}`, `Code: ${r.setupInvite.code} (single use, expires ${r.setupInvite.expiresAt})`, '', r.whatsappText];
  }
  if (cmd === 'setup-link') {
    const id = Number(f.school);
    if (!Number.isInteger(id) || id < 1) throw new Error('--school <id> is required');
    const r = await createSetupLink(db, id, base);
    return [`Setup link: ${r.url}`, `Code: ${r.code} (single use, expires ${r.expiresAt})`, '', r.whatsappText];
  }
  if (cmd === 'list') {
    const rows = await listSchools(db);
    return rows.length === 0 ? ['No schools yet.'] : rows.map((r) => `#${r.school.id}  ${r.school.name}  [${r.school.status}]  teachers ${r.teachers}, classes ${r.classes}, students ${r.students}  /s/${r.school.studentCode}`);
  }
  throw new Error(USAGE);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDb(scriptDatabaseUrl(), { max: 1 });
  try {
    for (const line of await runAdmin(db, process.argv.slice(2))) console.log(line);
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
