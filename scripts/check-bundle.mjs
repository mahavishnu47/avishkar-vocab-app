#!/usr/bin/env node
/**
 * Bundle budget: the student entry chunk plus its STATIC imports (what a child's phone downloads first)
 * must be under 150 KB gzipped and must not contain the QR library (teacher/school only).
 * Run after `npm run build`. Usage: node scripts/check-bundle.mjs [distDir]
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';

const dist = resolve(process.argv[2] || join(import.meta.dirname, '..', 'apps/web/dist'));
const BUDGET = 150 * 1024;
if (!existsSync(join(dist, 'index.html'))) { console.error(`No build at ${dist}. Run: npm run build`); process.exit(2); }

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
if (!entry) { console.error('Entry script not found in index.html'); process.exit(2); }

const seen = new Set();
function staticImports(file) {
  const rel = file.replace(/^\//, '');
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = readFileSync(join(dist, rel), 'utf8');
  // static imports in minified ESM: `from"./x.js"` and bare `import"./x.js"` (dynamic import( ... ) is excluded)
  for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) {
    staticImports(join(dirname(rel), m[1]).replace(/\\/g, '/'));
  }
}
staticImports(entry);
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) staticImports(m[1]);

let total = 0;
const problems = [];
for (const f of seen) {
  const buf = readFileSync(join(dist, f));
  const gz = gzipSync(buf).length;
  total += gz;
  console.log(`  ${(gz / 1024).toFixed(1).padStart(7)} KB gz  ${f}`);
  const text = buf.toString('utf8');
  if (/qrcode-generator|QRCode|createSvgTag/.test(text)) problems.push(`QR library found in student chunk ${f}`);
}
console.log(`student entry total: ${(total / 1024).toFixed(1)} KB gzipped (budget ${BUDGET / 1024} KB)`);
if (total > BUDGET) problems.push(`over budget by ${((total - BUDGET) / 1024).toFixed(1)} KB`);
if (problems.length) { for (const p of problems) console.error('FAIL: ' + p); process.exit(1); }
console.log('check:bundle OK');
