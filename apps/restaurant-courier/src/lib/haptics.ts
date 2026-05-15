/**
 * Thin wrapper around navigator.vibrate for consistent haptic feedback
 * patterns across the courier app.
 *
 * All functions are no-ops when the Vibration API is unavailable (iOS Safari,
 * some desktop browsers). Calls are also guarded against throws on WebKit
 * builds that expose the method but block it without a user gesture.
 */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Silently ignore — e.g. iOS WebKit or locked-down browser contexts.
  }
}

/** Short single pulse: order accepted, photo captured, swipe registered. */
export function success(): void {
  vibrate([10]);
}

/** Double-pulse: attention required but not an error. */
export function warning(): void {
  vibrate([10, 50, 10]);
}

/** Triple-pulse: action failed, connection lost. */
export function failure(): void {
  vibrate([20, 50, 20, 50, 20]);
}

/** Micro-tick: button pressed, item toggled. */
export function tap(): void {
  vibrate([5]);
}
