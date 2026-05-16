'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type Ripple = { id: number; x: number; y: number; size: number };

/**
 * Hook that attaches a Material-style touch ripple to any element via ref.
 * The host element MUST be positioned (relative/absolute/fixed) and have
 * `overflow-hidden` so the ripple is clipped to its rounded shape.
 *
 * Returns { ripples, onPointerDown } — splat onPointerDown onto the host
 * and render the ripples array as positioned spans.
 *
 * Honors prefers-reduced-motion: returns no-op handler, empty array.
 */
export function useRipple<T extends HTMLElement>(
  ref: RefObject<T>,
  durationMs = 500,
) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      if (typeof window !== 'undefined') {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (mq?.matches) return;
      }
      const host = ref.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size =
        2 *
        Math.max(
          Math.hypot(x, y),
          Math.hypot(rect.width - x, y),
          Math.hypot(x, rect.height - y),
          Math.hypot(rect.width - x, rect.height - y),
        );
      const id = idRef.current++;
      setRipples((rs) => [...rs, { id, x, y, size }]);
      window.setTimeout(() => {
        setRipples((rs) => rs.filter((r) => r.id !== id));
      }, durationMs);
    },
    [durationMs, ref],
  );

  // Defensive cleanup on unmount so a long animation doesn't update an
  // unmounted component.
  useEffect(() => {
    return () => setRipples([]);
  }, []);

  return { ripples, onPointerDown };
}

/**
 * Drop-in ripple layer. Place inside a positioned + overflow-hidden parent.
 * Renders the spans returned by useRipple.
 */
export function RippleLayer({
  ripples,
  colorClass = 'bg-white/25',
  durationMs = 500,
}: {
  ripples: Ripple[];
  colorClass?: string;
  durationMs?: number;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className={`absolute block rounded-full ${colorClass} animate-ripple`}
          style={{
            left: r.x - r.size / 2,
            top: r.y - r.size / 2,
            width: r.size,
            height: r.size,
            animationDuration: `${durationMs}ms`,
          }}
        />
      ))}
    </span>
  );
}
