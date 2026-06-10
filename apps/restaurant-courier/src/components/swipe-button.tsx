'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronRight, Check, Loader2 } from 'lucide-react';
import { toast } from '@hir/ui';
import * as haptics from '@/lib/haptics';

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
  disabled = false,
}: {
  label: string;
  /**
   * Action fired on confirm. May return a boolean: `false` means the action
   * ran but did nothing (e.g. the order was already taken / cancelled / gated)
   * — the slider then springs back instead of showing a false "Confirmat".
   * `void`/`true`/anything-else counts as success (back-compat for the many
   * callers that return void, like start/end shift).
   */
  onConfirm: () => Promise<void | boolean> | void | boolean;
  /** primary = purple accent, success = green for "delivered" final step. */
  variant?: 'primary' | 'success';
  /** Grey, non-interactive state — e.g. "Ridică comanda" before the vendor
   *  marks the order ready. Shows the label + a static handle, cannot swipe. */
  disabled?: boolean;
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
        haptics.select();
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
    if (pending || done || disabled) return;
    // Two-pulse pattern (commit + acknowledgement) — distinguishable
    // from the single-tick threshold-cross above, so the courier feels
    // a clear "fired" cue separate from "approaching threshold".
    haptics.custom([30, 40, 30]);
    setPending(true);
    try {
      const result = await onConfirm();
      if (result === false) {
        // The action completed but changed nothing — don't fake a success.
        // Spring the handle back and tell the courier why so they aren't
        // staring at a permanent green "Confirmat" for an order that never
        // got accepted/picked up.
        toast('Comanda nu mai este disponibilă.', { duration: 4000 });
        animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
        setPending(false);
        setHoldProgress(false);
        armedRef.current = false;
        return;
      }
      haptics.success();
      setDone(true);
    } catch (err) {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
      setPending(false);
      setHoldProgress(false);
      armedRef.current = false;
      // The action FAILED (network / server). Tell the courier instead of just
      // springing the handle back in silence — otherwise they think the app
      // ignored them and don't know to retry. Accept/pickup/deliver are the
      // most important actions and were failing with zero feedback.
      const name = (err as { name?: string } | null)?.name;
      const networky =
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        name === 'TypeError' ||
        name === 'AbortError';
      toast(
        networky
          ? 'Fără semnal — încearcă din nou când revii online.'
          : 'Nu am putut trimite acțiunea. Încearcă din nou.',
        { duration: 5000 },
      );
      try {
        haptics.custom([80, 40, 80]);
      } catch {
        // haptics unavailable — non-fatal.
      }
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
      className={`relative h-14 w-full select-none overflow-hidden rounded-full border border-hir-border ring-1 ring-inset ring-hir-border/40 ${
        disabled ? 'opacity-60' : ''
      }`}
      style={trackStyle}
      aria-disabled={pending || done || disabled}
    >
      {/* Track fill (grows behind the handle as it slides). */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: accent, opacity: fillOpacity }}
      />

      {/* Label centered on the track. White in both themes — the track is
          hardcoded dark zinc-800 (regardless of theme), so text-hir-fg
          rendered as zinc-900 on light theme produced dark text on dark
          track and the label was unreadable. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-sm font-semibold tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
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
      {/* Disabled: static grey handle, no drag/hold/keyboard. */}
      {disabled ? (
        <div className="absolute left-1 top-1 flex h-12 w-14 items-center justify-center rounded-full bg-zinc-600 text-zinc-300 shadow-md">
          <ChevronRight className="h-5 w-5" aria-hidden strokeWidth={2.5} />
        </div>
      ) : null}

      {!done && !pending && !disabled ? (
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
          onKeyDown={(e) => {
            // Keyboard accessibility: confirm on Enter/Space (the drag + hold
            // gestures are pointer-only). Funnels through the same runConfirm.
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              void runConfirm();
            }
          }}
          whileTap={{ scale: 0.98 }}
          className={`absolute left-1 top-1 flex h-12 w-14 cursor-grab items-center justify-center rounded-full text-white shadow-lg ${
            variant === 'success' ? 'shadow-emerald-500/40' : 'shadow-violet-500/40'
          } active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 ${
            variant === 'success' ? 'focus-visible:outline-emerald-400' : 'focus-visible:outline-violet-400'
          }`}
          aria-label={label}
        >
          <ChevronRight className="h-5 w-5" aria-hidden strokeWidth={2.5} />
        </motion.button>
      ) : null}

      {/* Pending / done state: stationary indicator on the right. */}
      {(pending || done) ? (
        <div
          className={`absolute right-1 top-1 flex h-12 w-14 items-center justify-center rounded-full text-white shadow-md ${
            variant === 'success' ? 'shadow-emerald-500/40' : 'shadow-violet-500/40'
          }`}
          style={{ background: accent }}
        >
          {done ? (
            <Check className="h-5 w-5 drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]" aria-hidden strokeWidth={3} />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden strokeWidth={2.5} />
          )}
        </div>
      ) : null}
    </div>
  );
}
