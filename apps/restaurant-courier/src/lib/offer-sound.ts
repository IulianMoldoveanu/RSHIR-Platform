/**
 * Courier-controlled "sound on new offer" preference + a tiny WebAudio
 * beep generator.
 *
 * Why not <audio src=…>? Bundling an mp3 in the PWA inflates the cache;
 * a WebAudio sine sweep is ~60 lines and works offline. The beep is a
 * pleasant two-tone chirp (E5 → A5, 180ms total) — distinct from the
 * default OS notification sound so the courier can tell it apart in noisy
 * environments.
 */

const STORAGE_KEY = 'hir-courier-offer-sound';
// Default ON. Missing offers because the phone was on silent is a common
// complaint, so the chirp should be the default behaviour.
const DEFAULT_ENABLED = true;

export function isOfferSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return DEFAULT_ENABLED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_ENABLED;
    return raw === 'true';
  } catch {
    return DEFAULT_ENABLED;
  }
}

export function setOfferSoundEnabled(v: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/**
 * Plays a two-tone chirp. Returns immediately; audio plays async.
 * Safe to call even when the user-gesture chain has been lost (silent
 * failure if browser policy blocks).
 */
export function playOfferChirp(): void {
  if (typeof window === 'undefined') return;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return;

  try {
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Tone 1: E5 (659 Hz) for ~90 ms.
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(659.25, now);
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.18, now + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    o1.connect(g1).connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.1);

    // Tone 2: A5 (880 Hz) for ~110 ms, starting at +100 ms.
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(880, now + 0.1);
    g2.gain.setValueAtTime(0, now + 0.1);
    g2.gain.linearRampToValueAtTime(0.22, now + 0.11);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    o2.connect(g2).connect(ctx.destination);
    o2.start(now + 0.1);
    o2.stop(now + 0.22);

    // Close the context shortly after the chirp finishes so we don't
    // leak running AudioContexts across hours of dashboard time.
    window.setTimeout(() => {
      ctx.close().catch(() => {
        /* already closed */
      });
    }, 400);
  } catch {
    // AudioContext creation failed (autoplay policy not satisfied yet).
  }
}
