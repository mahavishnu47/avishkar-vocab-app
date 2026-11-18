/**
 * Small request-validation helpers. Every failure is a 400 naming the field.
 */
import { badRequest, notFound } from './http.ts';
import { isValidDate } from './clock.ts';

export function asObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Request body must be a JSON object');
  return body as Record<string, unknown>;
}

export function reqString(o: Record<string, unknown>, field: string, min = 1, max = 500): string {
  const v = o[field];
  if (typeof v !== 'string') throw badRequest(`${field} must be a string`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw badRequest(`${field} must be ${min}-${max} characters`);
  return t;
}

export function optString(o: Record<string, unknown>, field: string, min = 1, max = 500): string | undefined {
  if (o[field] === undefined) return undefined;
  return reqString(o, field, min, max);
}

export function reqInt(o: Record<string, unknown>, field: string, min = 0, max = 1_000_000_000): number {
  const v = o[field];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw badRequest(`${field} must be an integer between ${min} and ${max}`);
  return v;
}

export function optInt(o: Record<string, unknown>, field: string, min = 0, max = 1_000_000_000): number | undefined {
  if (o[field] === undefined) return undefined;
  return reqInt(o, field, min, max);
}

export function reqBool(o: Record<string, unknown>, field: string): boolean {
  if (typeof o[field] !== 'boolean') throw badRequest(`${field} must be true or false`);
  return o[field] as boolean;
}

export function reqDate(v: unknown, field: string): string {
  if (!isValidDate(v)) throw badRequest(`${field} must be a date like 2026-11-20`);
  return v;
}

export function optDate(v: unknown, field: string): string | undefined {
  return v === undefined || v === '' ? undefined : reqDate(v, field);
}

export function reqIsoTs(o: Record<string, unknown>, field: string): string {
  const v = o[field];
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw badRequest(`${field} must be an ISO timestamp`);
  return v;
}

/** Path id param -> positive integer; anything else is a 404 (nothing to find). */
export function idParam(v: string | undefined): number {
  const n = Number(v);
  if (!v || !Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

export function stringArray(v: unknown, field: string, min: number, max: number, maxLen = 200): string[] {
  if (!Array.isArray(v) || v.length < min || v.length > max || v.some((x) => typeof x !== 'string')) {
    throw badRequest(`${field} must be a list of ${min}-${max} strings`);
  }
  const out = (v as string[]).map((s) => s.trim());
  if (out.some((s) => s.length === 0 || s.length > maxLen)) throw badRequest(`${field} has an empty or too long entry`);
  return out;
}
