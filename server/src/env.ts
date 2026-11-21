/**
 * Environment values pasted or piped into hosting dashboards/CLIs often carry an invisible BOM (U+FEFF), a trailing newline
 * or stray quotes. That made share links start with an invisible character and the admin secret never match (H-1).
 * Importing this module cleans the known variables once, before anything reads them.
 */
const NAMES = [
  'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'SUPER_ADMIN_SECRET', 'PUBLIC_APP_URL', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL',
  'TRUST_PROXY_HOPS', 'FAKE_TODAY', 'SEED_DEMO', 'PORT',
];

/** Remove BOMs and zero-width characters, surrounding whitespace and one pair of surrounding quotes. */
export function cleanEnvValue(v: string): string {
  let s = v.replace(/[﻿​‌‍⁠]/g, '').trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) s = s.slice(1, -1).trim();
  return s;
}

export function cleanEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const n of NAMES) {
    const v = env[n];
    if (typeof v === 'string') {
      const c = cleanEnvValue(v);
      if (c !== v) env[n] = c;
    }
  }
}

cleanEnv();
