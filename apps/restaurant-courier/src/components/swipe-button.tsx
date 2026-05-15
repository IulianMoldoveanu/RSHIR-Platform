'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronRight, Check, Loader2 } from 'lucide-react';
import * as haptics from '@/lib/haptics';

// Tiny haptic helper. Wrapped because navigator.vibrate throws on some
// iOS WebKit builds when called without a user gesture, and we'd rather
// degrade silently than crash the swipe. The duration values match the
// "Material short tap" haptic-pattern budget (15-50ms range).
function haptic(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* iOS / locked-down browsers — silent fallback. */
  }
}

/**
 * Swipe-to-confirm slider. Wolt Drive / Glovo Drive pattern: prevents
 * accidental taps when the phone is jostling in a bike mount or a pocket.
 *
 * Two activation paths so the courier is never stuck:
 *   1. Drag the handle past 70% of the track (primary, anti-misclick).
 *   2. Press-and-hold the handle for ~900ms (fallback for users who tap; also
 *      keyboard-friendly when long-press is mapped to a keypress).
 *
 * Both paths funnel through the same async `onConfirm`. A single tap (under
 * the hold threshold) does nothing, preserving the misclick-resistant intent.
 *
 * Vibrates 50ms on confirm if supported. While pending the track shows a
 * spinner and is not interactive.
 */
export function SwipeButton({
  label,
  onConfirm,
  variant = 'primary',
}: {
  label: string;
  onConfirm: () => Promise<void> | void;
  /** primary = purple accent, success = green for "delivered" final step. */
  variant?: 'primary' | 'success';
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armedRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [holdProgress, setHoldProgress] = useState(false);

  // Track fill animates from transparent → solid as the handle moves.
  const fillOpacity = useTransform(x, [0, 200], [0.0, 0.85]);

  // Light haptic tick the first time the drag crosses ~70% — the same
  // threshold `handleDragEnd` uses to decide whether a release counts as
  // a confirm. Lets the courier *feel* when they've passed the point of
  // no return, instead of guessing whether they swiped far enough.
  useEffect(() => {
    return x.on('change', (value) => {
      const trackWidth = trackRef.current?.offsetWidth ?? 0;
      if (trackWidth === 0) return;
      const maxTravel = trackWidth - 56 - 8;
      const threshold = maxTravel * 0.7;
      if (!armedRef.current && value >= threshold) {
        armedRef.current = true;
        haptic(15);
      } else if (armedRef.current && value < threshold) {
        armedRef.current = false;
      }
    });
  }, [x]);

  const accent = variant === 'success' ? 'rgb(16, 185, 129)' : 'rgb(139, 92, 246)';
  const trackStyle: CSSProperties = {
    background: 'rgb(39, 39, 42)', // zinc-800
  };

  async function runConfirm() {
    if (pending || done) return;
    // Two-pulse pattern (commit + acknowledgement) — distinguishable
    // from the single-tick threshold-cross above, so the courier feels
    // a clear "fired" cue separate from "approaching threshold".
    haptic([30, 40, 30]);
    setPending(true);
    try {
      await onConfirm();
      haptics.success();
      setDone(true);
    } catch (err) {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
      setPending(false);
      setHoldProgress(false);
      armedRef.current = false;
      // Surfaced to the dashboard error boundary if it bubbles past;
      // log defensively so the courier sees something in dev tools.
      console.error('[swipe-button] action failed', err);
    }
  }

  async function handleDragEnd() {
    if (!trackRef.current || pending || done) return;
    const trackWidth = trackRef.current.offsetWidth;
    const handleWidth = 56; // matches w-14 below
    const maxTravel = trackWidth - handleWidth - 8; // 4px padding each side
    const threshold = maxTravel * 0.7;

    if (x.get() >= threshold) {
      animate(x, maxTravel, { type: 'spring', stiffness: 380, damping: 32 });
      await runConfirm();
    } else {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }

  // Tap-and-hold fallback. Without this, users who tap (instead of swipe)
  // see no feedback and conclude the button is broken — exactly the
  // "online button not functional" complaint reported on the home tab.
  function handlePointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (pending || done) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setHoldProgress(true);
    holdTimer.current = setTimeout(() => {
      void runConfirm();
    }, 900);
  }
  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (!pending && !done) setHoldProgress(false);
  }

  return (
    <div
      ref={trackRef}
      className="relative h-14 w-full select-none overflow-hidden rounded-full border border-zinc-800"
      style={trackStyle}
      aria-disabled={pending || done}
    >
      {/* Track fill (grows behind the handle as it slides). */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: accent, opacity: fillOpacity }}
      />

      {/* Label centered on the track. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-sm font-medium tracking-wide text-zinc-100">
        {done
          ? 'Confirmat'
          : pending
            ? 'Se procesează…'
            : holdProgress
              ? 'Ține apăsat…'
              : label}
      </div>

      {/* Draggable handle. Also accepts press-and-hold (~900ms) as a tap
          fallback so the action is reachable even if drag gestures fail
          on the user's browser. Only rendered when interactive. */}
      {!done && !pending ? (
        <motion.button
          type="button"
          drag="x"
          dragConstraints={trackRef}
          dragElastic={0}
          dragMomentum={false}
          style={{ x, background: accent }}
          onDragStart={cancelHold}
          onDragEnd={handleDragEnd}
          onPointerDown={handlePointerDown}
          onPointerUp={cancelHold}
          onPointerCancel={cancelHold}
          onPointerLeave={cancelHold}
          whileTap={{ scale: 0.98 }}
          className="absolute left-1 top-1 flex h-12 w-14 cursor-grab items-center justify-center rounded-full text-white shadow-lg active:cursor-grabbing"
          aria-label={label}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </motion.button>
      ) : null}

      {/* Pending / done state: stationary indicator on the right. */}
      {(pending || done) ? (
        <div
          className="absolute right-1 top-1 flex h-12 w-14 items-center justify-center rounded-full text-white"
          style={{ background: accent }}
        >
          {done ? <Check className="h-5 w-5" aria-hidden /> : <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
        </div>
      ) : null}
    </div>
  );
}
