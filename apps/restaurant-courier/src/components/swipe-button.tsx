'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronRight, Check, Loader2 } from 'lucide-react';

/**
 * Swipe-to-confirm slider. Wolt Drive / Glovo Drive pattern: prevents
 * accidental taps when the phone is jostling in a bike mount or a pocket.
 *
 * The handle is dragged along a horizontal track; releasing past 70% of the
 * track width triggers `onConfirm`. Anything short snaps back. Vibrates 50ms
 * on confirm if the device supports it.
 *
 * Server actions are awaited in the parent's onConfirm; while pending, the
 * track shows a spinner and the user can't interact.
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
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  // Track fill animates from transparent → solid as the handle moves.
  const fillOpacity = useTransform(x, [0, 200], [0.0, 0.85]);

  const accent = variant === 'success' ? 'rgb(16, 185, 129)' : 'rgb(139, 92, 246)';
  const trackStyle: CSSProperties = {
    background: 'rgb(39, 39, 42)', // zinc-800
  };

  async function handleDragEnd() {
    if (!trackRef.current || pending || done) return;
    const trackWidth = trackRef.current.offsetWidth;
    const handleWidth = 56; // matches w-14 below
    const maxTravel = trackWidth - handleWidth - 8; // 4px padding each side
    const threshold = maxTravel * 0.7;

    if (x.get() >= threshold) {
      // Snap to fully confirmed, then run the action.
      animate(x, maxTravel, { type: 'spring', stiffness: 380, damping: 32 });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(50);
        } catch {
          /* some browsers throw on vibrate without a user gesture; ignore. */
        }
      }
      setPending(true);
      try {
        await onConfirm();
        setDone(true);
      } catch (err) {
        // Reset on error so the user can retry.
        animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
        setPending(false);
        // Re-throw so global error boundary / toast can pick it up if wired.
        throw err;
      }
    } else {
      // Below threshold — snap back.
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
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
        {done ? 'Confirmat' : pending ? 'Se procesează…' : label}
      </div>

      {/* Draggable handle. Only rendered when interactive. */}
      {!done && !pending ? (
        <motion.button
          type="button"
          drag="x"
          dragConstraints={trackRef}
          dragElastic={0}
          dragMomentum={false}
          style={{ x, background: accent }}
          onDragEnd={handleDragEnd}
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
