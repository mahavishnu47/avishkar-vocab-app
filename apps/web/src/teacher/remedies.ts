/** Suggested classroom activity per error code (static text for teachers). */
import { ERROR_LABELS, type SentenceErrorCode, type SpellingErrorCode } from '@shabd/core';

export const REMEDIES: Partial<Record<SpellingErrorCode | SentenceErrorCode, string>> = {
  SP_PHONETIC: 'Look-say-cover-write: show the word, let the child say it by syllables, cover it, then write it from memory.',
  SP_SILENT: 'Colour the silent letter (k in knee, w in write) and read a short list together; play "which letter is asleep?".',
  SP_DOUBLE: 'Sort words into "one" and "two" consonant piles (hopping / hoping); clap the beats and write both.',
  SP_VOWEL: 'Vowel hunt: underline vowels in 5 words, then rebuild each word from letter cards with vowels missing.',
  SP_OMISSION: 'Say the word slowly by syllable and tap once per sound, then count the letters before writing.',
  SP_INSERTION: 'Build the word with letter tiles and compare it with the child\'s version, letter by letter.',
  SP_TRANSPOSE: 'Finger-trace the word in the air, saying each letter in order, then write it twice slowly.',
  SP_SUBST: 'Pair the tricky letters (b/d, m/n) on cards and match them to pictures or sounds.',
  SP_HOMOPHONE: 'Draw both sound-alike words with a picture each (their / there) and write one sentence for each.',
  SP_REALWORD: 'Put the target word and the word the child wrote in two sentences so the meanings stay apart.',
  SP_L1: 'Minimal-pair practice for sounds Marathi/Hindi blur (v/w, s/sh, z/j, ph/f); say, listen and write.',
  SP_FARMISS: 'Re-teach the word from scratch with picture, meaning and a syllable clap; pair with a stronger partner.',
  SP_BLANK: 'Check the child is comfortable; model one word aloud, then ask them to try the first letter only.',
  SN_WORD_MISSING: 'Ask the child to underline the new word in their sentence before submitting; practise "my word is ...".',
  SN_WORD_MISSPELT: 'Have the child copy the word from the card before writing the sentence; check the spelling together.',
  SN_WRONG_FORM: 'Do a fill-in-the-blank round with the word as noun, verb or adjective as appropriate.',
  SN_CAPITAL: 'Capital letter, full stop: a "sentence sandwich" check, circling the first letter and the last mark.',
  SN_PUNCT: 'Read sentences aloud and let the class "stop" at each full stop; add the dot at the end of every line.',
  SN_NON_ENGLISH: 'Allow a Marathi sentence first, then translate it together into simple English words.',
  SN_NO_VERB: 'Ask "what is happening?" and add a doing word (verb): Who? + does what? + where?',
  SN_IRRELEVANT: 'Talk about the word with a picture first, then say the sentence aloud to a partner before writing.',
  SN_TOO_SHORT: 'Expand sentences with "who, where, when": "The dog ran." becomes "The dog ran to the park in the morning."',
  SN_COPIED: 'Cover the example sentence and ask for a sentence about the child\'s own life or school.',
  SN_FLAGGED: 'Have a quiet private conversation; check the sentence and how the child is doing.',
};

/** Weakness label ('Needs support: Silent letters') back to its code. */
export function codeFromLabel(label: string): SpellingErrorCode | SentenceErrorCode | null {
  const text = label.replace(/^Needs support:\s*/, '');
  for (const [code, l] of Object.entries(ERROR_LABELS)) if (l === text) return code as SpellingErrorCode | SentenceErrorCode;
  return null;
}
