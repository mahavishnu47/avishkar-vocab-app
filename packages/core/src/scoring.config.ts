/**
 * All scoring constants in one place (PRD section 7, simplified for the MVP).
 * 100 marks per word = spelling 40 + meaning 20 + sentence 40.
 * Bump SCORING_VERSION whenever a value changes; it is stored on every score row.
 */
export const SCORING_VERSION = 'mvp-1.0';

export const SCORING = {
  wordMax: 100,
  spelling: {
    max: 40,
    maxAttempts: 3,
    /** multiplier by attempt number on which the word was spelt correctly (index 0 = attempt 1) */
    attemptMultipliers: [1.0, 0.6, 0.3] as const,
    /** deducted after the multiplier, floor 0; each hint usable once per word. Replay/slow audio is free. */
    hintCost: { first_letter: 6, letter_tiles: 14 } as const,
  },
  meaning: {
    max: 20,
    maxAttempts: 2,
    /** marks by attempt number on which the correct option was tapped; wrong twice = 0 */
    marksByAttempt: [20, 8] as const,
  },
  sentence: {
    max: 40,
    maxSubmissions: 2,
    /** multiplier by submission number (index 0 = submission 1). Best final value is kept. */
    submissionMultipliers: [1.0, 0.8] as const,
    starterHintCost: 5,
    rubricMax: { use: 10, grammar: 10, relevance: 12, length: 8 } as const,
    /** Jaccard token similarity to the example sentence at/above which the sentence counts as copied */
    copyJaccard: 0.6,
    /** words that earn the R4 conjunction bonus (with >= 6 tokens) */
    conjunctions: ['and', 'but', 'because', 'so', 'when', 'while', 'if', 'which', 'who', 'that', 'or', 'after', 'before'] as const,
  },
  xp: {
    completionBonus: 25,
    streakBonusPerDay: 5,
    streakBonusCap: 50,
    perfectWordBonus: 5,
    /** XP multiplier for a past day's set (catch-up). No completion/streak bonus. */
    catchUpMultiplier: 0.5,
    /** level n is reached at levelStep * n*(n+1)/2 cumulative XP: L1=500, L2=1500, L3=3000 ... */
    levelStep: 500,
  },
  /** stars by word total: >=90 -> 3, >=60 -> 2, >=30 -> 1, else 0 */
  starThresholds: [90, 60, 30] as const,
} as const;

export type SpellingHint = keyof typeof SCORING.spelling.hintCost; // 'first_letter' | 'letter_tiles'
