// Shared constants for content scripts. Mirrors docs/CONTENT_SPEC.md - keep both in sync.

export const PARTS = [
  { part: 1, file: 'part-01.json', firstDay: 1, lastDay: 61, mix: { 1: 2, 2: 3, 3: 0 } },
  { part: 2, file: 'part-02.json', firstDay: 62, lastDay: 122, mix: { 1: 2, 2: 2, 3: 1 } },
  { part: 3, file: 'part-03.json', firstDay: 123, lastDay: 183, mix: { 1: 1, 2: 3, 3: 1 } },
  { part: 4, file: 'part-04.json', firstDay: 184, lastDay: 244, mix: { 1: 1, 2: 2, 3: 2 } },
  { part: 5, file: 'part-05.json', firstDay: 245, lastDay: 305, mix: { 1: 1, 2: 2, 3: 2 } },
  { part: 6, file: 'part-06.json', firstDay: 306, lastDay: 366, mix: { 1: 0, 2: 3, 3: 2 } },
];
export const TOTAL_DAYS = 366;
export const WORDS_PER_DAY = 5;
export const TOTAL_WORDS = TOTAL_DAYS * WORDS_PER_DAY; // 1830

export const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection'];

export const THEMES = [
  'family', 'home', 'school', 'friends', 'body-health', 'food', 'clothes', 'nature', 'weather-seasons',
  'animals', 'birds-insects', 'plants-trees', 'farming-village', 'water-rivers-sea', 'festivals',
  'maharashtra-culture', 'india', 'transport-travel', 'city-town', 'community-helpers', 'jobs-work',
  'sports-games', 'music-art', 'stories-imagination', 'emotions-feelings', 'character-values',
  'science-space', 'time-numbers', 'shapes-colours', 'actions-movement', 'communication', 'environment',
  'safety', 'technology', 'describing-things',
];

/** 32-bit FNV-1a of the lowercase word. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const ch of str.toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The ONLY part (1-6) allowed to use this word. Guarantees no cross-part duplicates. */
export function ownerPart(word) {
  return (fnv1a(word.trim().toLowerCase()) % 6) + 1;
}

export function partForDay(day) {
  return PARTS.find((p) => day >= p.firstDay && day <= p.lastDay);
}
