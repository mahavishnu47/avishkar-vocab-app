/**
 * Vercel serverless entry (bundled by scripts/build-api.mjs). No listen, no migrate, no seed:
 * schema and data are managed explicitly with `npm run db:migrate` / `db:seed`.
 */
import { createApp } from './app.ts';

export default createApp();
