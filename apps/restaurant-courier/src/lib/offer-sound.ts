/**
 * Courier-controlled "sound on new offer" preference + a WebAudio alarm
 * generator for incoming orders.
 *
 * Why not <audio src=…>? Bundling an mp3 in the PWA inflates the cache; a
 * WebAudio tone burst is self-contained and works offline.
 *
 * CRITICAL — autoplay policy: on Android WebView / mobile browsers an
 * AudioContext created OUTSIDE a user gesture starts `suspended`, so notes
 * scheduled on it are silent. The previous version created a fresh context
 * inside the realtime handler (never a gesture) and closed it 400ms later —
 * which meant the alarm almost never actually sounded when an order arrived
 * while the courier was idle, exactly when they most need to hear it.
 *
 * Fix: keep ONE shared context for the app's lifetime and unlock it on the
 * first/any user gesture via `armOfferAudio()`. Later alarms fired from a
 * realtime event then play because the context is already running.
 *
 * The sound itself is a rising three-tone square-wave alarm, repeated twice
 * (~1.3s). Loud and distinct from the OS notification chime so the courier
 * notices a new order even on a bike mount, in a pocket, or in traffic.
 */

import { isSilentNow } from './quiet-hours';

const STORAGE_KEY = 'hir-courier-offer-sound';
// Default ON. Missing offers because the phone was on silent is a common
// complaint, so the alarm should be the default behaviour.
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

// ── Shared, pre-unlocked AudioContext ──────────────────────────────────────
// A single context reused across the whole session. Never closed — closing it
// would put us back in the "suspended on next use" trap.
let sharedCtx: AudioContext | null = null;
let armed = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctx();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

/**
 * Unlock audio playback. Must be called once while the courier is in the app
 * (e.g. mounted by OrdersRealtime). Attaches passive, idempotent listeners
 * that resume the shared context on the first/any user gesture — the only
 * moment mobile browsers permit the initial resume — and again whenever the
 * app returns to the foreground (the OS may suspend the context in the
 * background). After this, alarms fired from realtime events actually sound.
 */
export function armOfferAudio(): void {
  if (typeof window === 'undefined' || armed) return;
  armed = true;

  const unlock = () => {
    const ctx = getCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        /* still no gesture / not permitted — try again next event */
      });
    }
  };

  const opts: AddEventListenerOptions = { passive: true };
  // Kept attached (not once) — some browsers re-suspend after inactivity, so
  // every gesture gets a chance to re-unlock. Resume is cheap + idempotent.
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('touchend', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlock();
  });
}

/**
 * Plays the new-order alarm: a rising three-tone burst (G5→C6→E6) repeated
 * twice, square-wave so it cuts through ambient noise. Returns immediately;
 * audio plays async. Respects the courier's quiet-hours window. Safe to call
 * even before `armOfferAudio` has unlocked the context — it best-effort
 * resumes, and once unlocked subsequent calls always sound.
 */
export function playOfferAlarm(): void {
  if (typeof window === 'undefined') return;
  // Respect the courier's do-not-disturb window.
  if (isSilentNow()) return;
  const ctx = getCtx();
  if (!ctx) return;
  // Best effort: if a gesture already armed us, this resolves instantly.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  try {
    const now = ctx.currentTime;
    const burst = [783.99, 1046.5, 1318.51]; // G5, C6, E6 — rising = urgency
    const beep = 0.13; // each beep duration (s)
    const gap = 0.06; // silence between beeps in a burst
    const restBetweenBursts = 0.12;
    const peak = 0.38; // loud (square wave) but below clipping; one osc at a time

    const scheduleBeep = (freq: number, start: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.012); // soft attack (anti-click)
      g.gain.setValueAtTime(peak, start + beep - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0008, start + beep); // decay
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + beep + 0.02);
    };

    let t = now;
    for (let rep = 0; rep < 2; rep++) {
      for (const freq of burst) {
        scheduleBeep(freq, t);
        t += beep + gap;
      }
      t += restBetweenBursts;
    }
    // NOTE: never close `ctx` — it is shared and must stay alive (and resumed)
    // for the next alarm. Closing was the old bug that re-suspended audio.
  } catch {
    // Scheduling failed (context in a bad state) — non-fatal.
  }
}
