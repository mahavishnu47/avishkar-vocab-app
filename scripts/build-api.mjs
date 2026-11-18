/** Pre-bundles the Express API into server/dist/handler.mjs for the Vercel function (api/index.mjs re-exports it). */
import { build } from 'esbuild';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
await build({
  entryPoints: [resolve(ROOT, 'server/src/vercel.ts')],
  outfile: resolve(ROOT, 'server/dist/handler.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['pg-native'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
