/**
 * Browser SpeechSynthesis wrapper (en-IN). OWNER: Lane C (student UI).
 * MVP audio decision: runtime Web Speech API, no pre-recorded files.
 * Voice choice: first voice with lang 'en-IN', else any 'en-GB', else any 'en*', else default.
 * Voices load asynchronously on Android Chrome - wait for 'voiceschanged' (max 1.5 s).
 */
export interface SpeakOptions {
  /** 1 = normal, 0.6 = slow (🐢 button). Default 0.9 for children. */
  rate?: number;
  /** cancel anything currently speaking first (default true) */
  interrupt?: boolean;
}

/** true if speechSynthesis exists in this browser */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Speak text. Resolves when finished (or immediately if unsupported). Never throws. */
export async function speak(text: string, opts?: SpeakOptions): Promise<void> {
  void text; void opts;
  throw new Error('not implemented');
}

export function stopSpeaking(): void {
  throw new Error('not implemented');
}

/** Name of the chosen voice, for the 'audio fallback' research flag and debugging. */
export function currentVoiceName(): string | null {
  throw new Error('not implemented');
}
