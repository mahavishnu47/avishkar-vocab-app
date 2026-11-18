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

let chosen: SpeechSynthesisVoice | null = null;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  return voices.find((v) => lang(v) === 'en-in')
    ?? voices.find((v) => lang(v) === 'en-gb')
    ?? voices.find((v) => lang(v).startsWith('en'))
    ?? voices.find((v) => v.default)
    ?? null;
}

/** Voices load asynchronously on Android Chrome: wait for 'voiceschanged' (max 1.5 s). */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length) return resolve(now);
    const done = () => { synth.removeEventListener?.('voiceschanged', done); clearTimeout(t); resolve(synth.getVoices()); };
    const t = setTimeout(done, 1500);
    synth.addEventListener?.('voiceschanged', done);
  });
  return voicesReady;
}

/** Speak text. Resolves when finished (or immediately if unsupported). Never throws. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!speechSupported()) return;
  try {
    const synth = window.speechSynthesis;
    const voices = await loadVoices();
    chosen = pickVoice(voices);
    if (opts.interrupt !== false) synth.cancel();
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (chosen) { u.voice = chosen; u.lang = chosen.lang; } else u.lang = 'en-IN';
      u.rate = opts.rate ?? 0.9;
      const guard = setTimeout(resolve, 15000 + text.length * 120);
      const end = () => { clearTimeout(guard); resolve(); };
      u.onend = end; u.onerror = end;
      synth.speak(u);
    });
  } catch { /* speech must never break the app */ }
}

export function stopSpeaking(): void {
  try { if (speechSupported()) window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

/** Name of the chosen voice, for the 'audio fallback' research flag and debugging. */
export function currentVoiceName(): string | null {
  return chosen ? chosen.name : null;
}
