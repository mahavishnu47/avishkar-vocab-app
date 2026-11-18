/**
 * Mimics the Vercel setup locally: static apps/web/dist, /api/* -> server/dist/handler.mjs, SPA fallback to index.html.
 * Usage: node scripts/serve-prod.mjs [port]   (needs `npm run vercel-build` first and DATABASE_URL for the API)
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'apps/web/dist');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const { default: handler } = await import(resolve(ROOT, 'api/index.mjs'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/api' || path.startsWith('/api/')) return handler(req, res);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) file = join(DIST, 'index.html');
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`[serve-prod] http://localhost:${port}`));
