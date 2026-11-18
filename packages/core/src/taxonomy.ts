/**
 * Error taxonomy (PRD section 9). These string codes are stored in the DB
 * (word_attempts.error_tags / primary_error, sentence_submissions.error_codes)
 * and appear in CSV exports. DO NOT rename without a migration.
 */

/** 9.1 Spelling error categories. Multi-label per attempt; one primary tag. */
export const SpellingErrorCode = {
  CORRECT: 'SP_CORRECT',
  PHONETIC: 'SP_PHONETIC', // sounds the same (simplified metaphone + Indian-English rules)
  SILENT: 'SP_SILENT', // silent letter omitted: wh, kn, wr, -mb, -gh, final -e
  DOUBLE: 'SP_DOUBLE', // consonant pair doubled/undoubled
  VOWEL: 'SP_VOWEL', // only vowels differ (substitution or omission)
  OMISSION: 'SP_OMISSION', // other missing letter(s)
  INSERTION: 'SP_INSERTION', // other extra letter(s)
  TRANSPOSE: 'SP_TRANSPOSE', // adjacent letters swapped
  SUBST: 'SP_SUBST', // non-phonetic consonant swap
  HOMOPHONE: 'SP_HOMOPHONE', // real word that sounds identical (their/there)
  REALWORD: 'SP_REALWORD', // other real English word (brave -> brake)
  L1: 'SP_L1', // Marathi/Hindi transfer: v<->w, s<->sh, z<->j, ph<->f, dropped schwa
  FARMISS: 'SP_FARMISS', // edit distance > 50% of target length
  BLANK: 'SP_BLANK', // empty or single letter
} as const;
export type SpellingErrorCode = (typeof SpellingErrorCode)[keyof typeof SpellingErrorCode];

/**
 * Priority order for choosing the primary tag (highest first). PRD 9.1.
 * SP_CORRECT and SP_BLANK are exclusive (they are never combined with others).
 */
export const SPELLING_PRIMARY_PRIORITY: readonly SpellingErrorCode[] = [
  'SP_HOMOPHONE',
  'SP_REALWORD',
  'SP_SILENT',
  'SP_DOUBLE',
  'SP_L1',
  'SP_VOWEL',
  'SP_TRANSPOSE',
  'SP_PHONETIC',
  'SP_OMISSION',
  'SP_INSERTION',
  'SP_SUBST',
  'SP_FARMISS',
];

/** 9.2 Meaning check outcomes. */
export const MeaningErrorCode = {
  WRONG_1: 'MN_WRONG_1', // correct on 2nd tap
  WRONG_2: 'MN_WRONG_2', // wrong both times
} as const;
export type MeaningErrorCode = (typeof MeaningErrorCode)[keyof typeof MeaningErrorCode];

/** 9.3 Sentence error categories (derived from rubric + flags). */
export const SentenceErrorCode = {
  WORD_MISSING: 'SN_WORD_MISSING', // R1 gate failed
  WORD_MISSPELT: 'SN_WORD_MISSPELT', // R1 = 5
  WRONG_FORM: 'SN_WRONG_FORM', // target present but implausible POS slot
  CAPITAL: 'SN_CAPITAL', // no capital first letter
  PUNCT: 'SN_PUNCT', // no end punctuation
  NON_ENGLISH: 'SN_NON_ENGLISH', // lexicon ratio < 60% or Devanagari
  NO_VERB: 'SN_NO_VERB', // no verb detected
  IRRELEVANT: 'SN_IRRELEVANT', // R3 <= 6
  TOO_SHORT: 'SN_TOO_SHORT', // R4 = 0
  COPIED: 'SN_COPIED', // Jaccard >= 0.6 with example sentence
  FLAGGED: 'SN_FLAGGED', // moderation hit (teacher-only label)
} as const;
export type SentenceErrorCode = (typeof SentenceErrorCode)[keyof typeof SentenceErrorCode];

/** Teacher-facing labels for dashboards (student detail + class heatmap). */
export const ERROR_LABELS: Record<SpellingErrorCode | SentenceErrorCode | MeaningErrorCode, string> = {
  SP_CORRECT: 'Correct',
  SP_PHONETIC: 'Spells by sound',
  SP_SILENT: 'Silent letters',
  SP_DOUBLE: 'Double letters',
  SP_VOWEL: 'Vowel confusion',
  SP_OMISSION: 'Missing letters',
  SP_INSERTION: 'Extra letters',
  SP_TRANSPOSE: 'Swapped letters',
  SP_SUBST: 'Wrong consonant',
  SP_HOMOPHONE: 'Sound-alike word',
  SP_REALWORD: 'Different real word',
  SP_L1: 'Marathi/Hindi sound transfer',
  SP_FARMISS: 'Far from the word',
  SP_BLANK: 'No attempt',
  MN_WRONG_1: 'Meaning: 2nd try',
  MN_WRONG_2: 'Meaning: not understood',
  SN_WORD_MISSING: 'Forgets to use the word',
  SN_WORD_MISSPELT: 'Misspells the word in sentences',
  SN_WRONG_FORM: 'Wrong word form / usage',
  SN_CAPITAL: 'Capital letters',
  SN_PUNCT: 'Full stops',
  SN_NON_ENGLISH: 'Non-English words',
  SN_NO_VERB: 'Incomplete sentence (no verb)',
  SN_IRRELEVANT: 'Meaning not clear',
  SN_TOO_SHORT: 'Very short sentences',
  SN_COPIED: 'Copies example sentences',
  SN_FLAGGED: 'Needs a conversation',
};
