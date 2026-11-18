#!/usr/bin/env node
// Validate content/words/part-0N.json against docs/CONTENT_SPEC.md.
//
//   node scripts/validate-words.mjs              full check: all 6 parts, exactly 1830 words, days 1-366
//   node scripts/validate-words.mjs --part 3     check only part-03.json (schema, ownership, its 61 days)
//   node scripts/validate-words.mjs --partial    full check but missing parts/days are warnings (progress view)
//
// Exit code 0 = no errors (warnings allowed), 1 = errors.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTS, POS, THEMES, TOTAL_WORDS, WORDS_PER_DAY, ownerPart, partForDay } from './lib/words-common.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.CONTENT_DIR ?? join(ROOT, 'content', 'words');
const args = process.argv.slice(2);
const onlyPart = args.includes('--part') ? Number(args[args.indexOf('--part') + 1]) : null;
const partial = args.includes('--partial');

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const DEVANAGARI = /[ऀ-ॿ]/;
const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const tokens = (s) => s.toLowerCase().match(/[a-z']+/g) ?? [];

/** Regular inflections a sentence may use instead of the headword (mirrors core acceptedForms, roughly). */
function inflections(word, forms = []) {
  const w = word.toLowerCase();
  const out = new Set([w, ...forms.map((f) => f.toLowerCase())]);
  const cons = /[^aeiou]$/;
  for (const suf of ['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly', 'ful', 'ness']) out.add(w + suf);
  if (w.endsWith('e')) { out.add(w.slice(0, -1) + 'ing'); out.add(w.slice(0, -1) + 'er'); out.add(w.slice(0, -1) + 'est'); }
  if (w.endsWith('y') && cons.test(w.slice(0, -1))) for (const s of ['ies', 'ied', 'ier', 'iest', 'ily']) out.add(w.slice(0, -1) + s);
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) { const d = w + w.at(-1); out.add(d + 'ed'); out.add(d + 'ing'); out.add(d + 'er'); out.add(d + 'est'); }
  if (w.endsWith('le')) out.add(w.slice(0, -1) + 'y');
  return out;
}

function checkEntry(e, part, where) {
  const req = ['id', 'dayIndex', 'word', 'partOfSpeech', 'difficulty', 'meaning', 'exampleSentence',
    'distractorMeanings', 'syllables', 'tags', 'contextWords'];
  for (const k of req) if (e[k] === undefined || e[k] === null) err(where, `missing field "${k}"`);
  const allowed = new Set([...req, 'forms']);
  for (const k of Object.keys(e)) if (!allowed.has(k)) err(where, `unknown field "${k}"`);
  if (errors.length > 500) return;

  const m = /^d(\d{3})-([1-5])$/.exec(e.id ?? '');
  if (!m) err(where, `id "${e.id}" must look like d001-1`);
  else if (Number(m[1]) !== e.dayIndex) err(where, `id day ${m[1]} != dayIndex ${e.dayIndex}`);

  if (!Number.isInteger(e.dayIndex) || e.dayIndex < part.firstDay || e.dayIndex > part.lastDay)
    err(where, `dayIndex ${e.dayIndex} outside part ${part.part} range ${part.firstDay}-${part.lastDay}`);

  const w = e.word;
  if (typeof w !== 'string' || !/^[a-z]{3,14}$/.test(w)) err(where, `word "${w}" must be lowercase a-z, 3-14 letters`);
  else if (ownerPart(w) !== part.part) err(where, `word "${w}" belongs to part ${ownerPart(w)} (node scripts/word-owner.mjs ${w})`);

  if (!POS.includes(e.partOfSpeech)) err(where, `partOfSpeech "${e.partOfSpeech}" not in ${POS.join('|')}`);
  if (![1, 2, 3].includes(e.difficulty)) err(where, `difficulty must be 1, 2 or 3`);

  if (typeof e.meaning === 'string') {
    const n = wordCount(e.meaning);
    if (n < 2 || n > 12) err(where, `meaning must be 2-12 words (has ${n})`);
    if (w && tokens(e.meaning).includes(w)) err(where, `meaning must not contain the word itself`);
  } else err(where, 'meaning must be a string');


  if (typeof e.exampleSentence === 'string') {
    const s = e.exampleSentence.trim();
    const n = wordCount(s);
    if (n < 6 || n > 14) err(where, `exampleSentence must be 6-14 words (has ${n})`);
    if (!/^[A-Z"']/.test(s)) err(where, 'exampleSentence must start with a capital letter');
    if (!/[.!?]["']?$/.test(s)) err(where, 'exampleSentence must end with . ! or ?');
    if (w) {
      const forms = inflections(w, e.forms);
      if (!tokens(s).some((t) => forms.has(t))) err(where, `exampleSentence must contain "${w}" (or a listed form)`);
    }
  } else err(where, 'exampleSentence must be a string');

  const d = e.distractorMeanings;
  if (!Array.isArray(d) || d.length !== 2 || d.some((x) => typeof x !== 'string' || wordCount(x) < 2 || wordCount(x) > 12))
    err(where, 'distractorMeanings must be exactly 2 strings of 2-12 words');
  else {
    const all = [e.meaning, ...d].map((x) => String(x).trim().toLowerCase());
    if (new Set(all).size !== 3) err(where, 'meaning and distractors must all differ');
    if (w && d.some((x) => tokens(x).includes(w))) err(where, 'distractors must not contain the word itself');
  }

  if (!Array.isArray(e.syllables) || !e.syllables.length || e.syllables.some((x) => typeof x !== 'string' || !x))
    err(where, 'syllables must be a non-empty string array');
  else if (w && e.syllables.join('').toLowerCase() !== w) err(where, `syllables join "${e.syllables.join('')}" != word "${w}"`);

  if (!Array.isArray(e.tags) || e.tags.length < 1 || e.tags.length > 3) err(where, 'tags must have 1-3 entries');
  else for (const t of e.tags) if (!THEMES.includes(t)) err(where, `tag "${t}" not in the theme list (CONTENT_SPEC 4)`);

  if (!Array.isArray(e.contextWords) || e.contextWords.length < 3 || e.contextWords.length > 6) err(where, 'contextWords must have 3-6 entries');
  else for (const c of e.contextWords) {
    if (typeof c !== 'string' || !/^[a-z]+$/.test(c)) err(where, `contextWord "${c}" must be lowercase a-z`);
    else if (c === w) err(where, 'contextWords must not include the word itself');
  }

  if (e.forms !== undefined && (!Array.isArray(e.forms) || e.forms.some((f) => typeof f !== 'string' || !/^[a-z]+$/.test(f))))
    err(where, 'forms must be an array of lowercase a-z strings');
}

function checkDay(day, entries, part) {
  const where = `day ${day}`;
  if (entries.length !== WORDS_PER_DAY) { err(where, `has ${entries.length} words, needs ${WORDS_PER_DAY}`); return; }
  const slots = entries.map((e) => e.id?.split('-')[1]).sort().join('');
  if (slots !== '12345') err(where, `slots must be 1-5 once each (got ${slots})`);
  const mix = { 1: 0, 2: 0, 3: 0 };
  for (const e of entries) mix[e.difficulty] = (mix[e.difficulty] ?? 0) + 1;
  for (const lvl of [1, 2, 3]) if (mix[lvl] !== part.mix[lvl])
    err(where, `difficulty mix ${mix[1]}/${mix[2]}/${mix[3]} (easy/med/hard) must be ${part.mix[1]}/${part.mix[2]}/${part.mix[3]}`);
  const pos = entries.map((e) => e.partOfSpeech);
  for (const p of ['noun', 'verb', 'adjective']) if (!pos.includes(p)) err(where, `needs at least one ${p}`);
  const firsts = new Set(entries.map((e) => e.word?.[0]));
  if (firsts.size < 4) warn(where, 'try not to repeat a starting letter within a day');
}

// ------------------------------------------------------------------ run
const parts = onlyPart ? PARTS.filter((p) => p.part === onlyPart) : PARTS;
if (!parts.length) { console.error('--part must be 1-6'); process.exit(2); }

const seen = new Map(); // word -> where
let total = 0;
const perPartCount = {};
for (const part of parts) {
  const path = join(DIR, part.file);
  if (!existsSync(path)) { (partial ? warn : err)(part.file, 'file missing'); continue; }
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { err(part.file, `invalid JSON: ${e.message}`); continue; }
  if (!Array.isArray(data)) { err(part.file, 'top level must be a JSON array'); continue; }

  const ids = new Set();
  const byDay = new Map();
  data.forEach((e, i) => {
    const where = `${part.file}[${i}] ${e?.id ?? ''} ${e?.word ?? ''}`.trim();
    if (!e || typeof e !== 'object') { err(where, 'entry must be an object'); return; }
    checkEntry(e, part, where);
    if (ids.has(e.id)) err(where, `duplicate id ${e.id}`);
    ids.add(e.id);
    const key = String(e.word ?? '').toLowerCase();
    if (seen.has(key)) err(where, `duplicate word "${key}" (also at ${seen.get(key)})`);
    else seen.set(key, where);
    if (!byDay.has(e.dayIndex)) byDay.set(e.dayIndex, []);
    byDay.get(e.dayIndex).push(e);
  });
  for (let day = part.firstDay; day <= part.lastDay; day++) {
    const entries = byDay.get(day) ?? [];
    if (!entries.length && partial) { warn(`day ${day}`, 'not written yet'); continue; }
    checkDay(day, entries, part);
  }
  for (const d of byDay.keys()) if (!partForDay(d) || partForDay(d).part !== part.part) err(part.file, `contains day ${d} of another part`);
  total += data.length;
  perPartCount[part.file] = data.length;
}

if (!onlyPart && !partial && total !== TOTAL_WORDS) err('total', `${total} words, expected exactly ${TOTAL_WORDS}`);

const show = (list, label, max) => {
  if (!list.length) return;
  console.log(`\n${label} (${list.length}):`);
  for (const l of list.slice(0, max)) console.log('  - ' + l);
  if (list.length > max) console.log(`  ... and ${list.length - max} more`);
};
show(warnings, 'WARNINGS', args.includes('--all') ? 1e9 : 30);
show(errors, 'ERRORS', args.includes('--all') ? 1e9 : 80);
console.log(`\nParts: ${JSON.stringify(perPartCount)}  total words: ${total}${onlyPart ? '' : ` / ${TOTAL_WORDS}`}`);
console.log(errors.length ? `FAIL: ${errors.length} error(s)` : 'OK');
process.exit(errors.length ? 1 : 0);
