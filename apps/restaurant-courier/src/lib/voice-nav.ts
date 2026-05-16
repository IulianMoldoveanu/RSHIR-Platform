/**
 * Voice navigation utility for the courier app.
 *
 * Uses the Web Speech API (speechSynthesis) to read out navigation prompts
 * in Romanian, so couriers can keep their eyes on the road during delivery.
 *
 * Opt-in only: the feature is disabled by default and enabled via a
 * LocalStorage flag toggled from Settings → Notificări.
 *
 * All functions are no-ops when speechSynthesis is unavailable (older
 * Android WebView builds, some desktop browsers).
 */

const STORAGE_KEY = 'hir-courier-voice-nav';
const VOICE_LANG = 'ro-RO';

/** Returns true when the courier has opted in to voice prompts. */
export function isVoiceNavEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persists the courier's opt-in/opt-out preference. */
export function setVoiceNavEnabled(v: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (v) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode, quota) — ignore.
  }
}

/**
 * Speaks the given message via speechSynthesis with a Romanian voice.
 *
 * - Picks the first available ro-RO voice; falls back to the browser default
 *   voice with lang='ro-RO' if no Romanian voice is installed.
 * - Queues behind any ongoing utterance (does not cancel in-progress speech).
 * - Silent no-op when speechSynthesis is unavailable.
 */
export function speak(message: string): void {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = VOICE_LANG;
  utterance.rate = 1.0;

  // Prefer a Romanian voice when the OS has one installed (common on Android
  // after the user downloads the Google TTS RO pack).
  const voices = window.speechSynthesis.getVoices();
  const roVoice = voices.find((v) => v.lang === VOICE_LANG || v.lang.startsWith('ro'));
  if (roVoice) utterance.voice = roVoice;

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    // Silently ignore — e.g. page not focused, browser policy.
  }
}
