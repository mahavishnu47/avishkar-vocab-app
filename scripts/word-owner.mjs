#!/usr/bin/env node
// Which content part owns a word?  (docs/CONTENT_SPEC.md section 3)
//   node scripts/word-owner.mjs brave village whisper        -> prints "brave 4" ...
//   node scripts/word-owner.mjs --part 3 --file cands.txt     -> prints only the words part 3 may use (one per line)
//   (cands.txt: one word per line or comma/space separated; duplicates and non a-z entries dropped)
import { readFileSync } from 'node:fs';
import { ownerPart } from './lib/words-common.mjs';

const args = process.argv.slice(2);
const partIdx = args.indexOf('--part');
const fileIdx = args.indexOf('--file');
const part = partIdx >= 0 ? Number(args[partIdx + 1]) : null;
let words = args.filter((a, i) => !a.startsWith('--') && (partIdx < 0 || i !== partIdx + 1) && (fileIdx < 0 || i !== fileIdx + 1));
if (fileIdx >= 0) words = words.concat(readFileSync(args[fileIdx + 1], 'utf8').split(/[\s,]+/));
const uniq = [...new Set(words.map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w)))];

if (!uniq.length) {
  console.error('usage: node scripts/word-owner.mjs [--part N] [--file list.txt] [word ...]');
  process.exit(2);
}
for (const w of uniq) {
  const p = ownerPart(w);
  if (part === null) console.log(`${w} ${p}`);
  else if (p === part) console.log(w);
}
