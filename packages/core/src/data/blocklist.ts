/**
 * Small moderation lists. English + transliterated Marathi/Hindi. Kept deliberately short;
 * matched against whole lowercase tokens (and a few spaced phrases).
 */
export const PROFANITY_TOKENS: readonly string[] = [
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'bastard', 'asshole', 'pussy', 'slut', 'whore',
  'damn', 'crap', 'bloody', 'idiot', 'stupid', 'moron', 'retard', 'sex', 'sexy', 'porn', 'nude', 'naked', 'rape',
  'chutiya', 'chutiye', 'madarchod', 'bhosdike', 'bhenchod', 'behenchod', 'bhosda', 'gandu', 'gaandu', 'randi',
  'harami', 'haramkhor', 'kutta', 'kamina', 'saala', 'sala', 'lund', 'lauda', 'chod', 'jhatu', 'zavadya', 'zavnya',
  'bhadvya', 'bhadwa', 'raandi', 'aaichi', 'gand', 'tatti', 'kutri', 'chinal', 'chhinal',
];
export const SAFEGUARDING_PHRASES: readonly string[] = [
  'beat me', 'beats me', 'beating me', 'hit me', 'hits me', 'hurt me', 'hurts me', 'touch me', 'touches me',
  'touched me', 'kill myself', 'want to die', 'wanna die', 'hurt myself', 'kill me', 'molest', 'abuse me',
  'abuses me', 'scared of home', 'afraid to go home', 'no one loves me', 'nobody loves me',
];
