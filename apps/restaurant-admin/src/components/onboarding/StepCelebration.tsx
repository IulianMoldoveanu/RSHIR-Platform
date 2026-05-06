'use client';

// Lane ONBOARDING-CELEBRATION — per-step confetti.
//
// Two intensities:
//   • 'step'   → 18 particles, ~1.5s, fired on each step advance.
//   • 'golive' → 50 particles, ~3s, fired right before the redirect to /dashboard.
//
// Respects `prefers-reduced-motion`: when the user has the OS setting on,
// we skip the animation entirely and return null (the toast still fires
// from the caller, so feedback is preserved).
//
// The component is fixed-positioned, pointer-events-none, z-50 — it never
// blocks UI. It self-cleans by calling `onDone` after the animation ends.

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo } from 'react';

type Intensity = 'step' | 'golive';

const HIR_PURPLE = '#7c3aed';
const COLORS: Record<Intensity, string[]> = {
  // Brand-led: deep HIR purple anchors a small accent palette.
  step: [HIR_PURPLE, '#a855f7', '#10b981', '#f59e0b'],
  golive: [HIR_PURPLE, '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'],
};

const PARTICLE_COUNT: Record<Intensity, number> = {
  step: 18,
  golive: 50,
};

const DURATION_MS: Record<Intensity, number> = {
  step: 1500,
  golive: 3000,
};

type Particle = {
  id: number;
  color: string;
  x: number; // horizontal drift in px
  y: number; // vertical fall in px
  rotate: number; // final rotation in deg
  delay: number; // staggered start in s
  size: number; // px
};

function generateParticles(intensity: Intensity, seed: number): Particle[] {
  const count = PARTICLE_COUNT[intensity];
  const palette = COLORS[intensity];
  // Tiny deterministic PRNG so SSR + CSR match if ever rendered server-side.
  // (Component is `use client` → only runs on client, but cheap insurance.)
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: palette[i % palette.length] ?? HIR_PURPLE,
    x: (rand() - 0.5) * (intensity === 'golive' ? 600 : 320),
    y: 200 + rand() * (intensity === 'golive' ? 400 : 220),
    rotate: (rand() - 0.5) * 720,
    delay: rand() * 0.25,
    size: 6 + rand() * (intensity === 'golive' ? 8 : 5),
  }));
}

export function StepCelebration({
  intensity,
  fireKey,
  onDone,
}: {
  intensity: Intensity;
  // Changing this prop re-runs the burst. Use the step number / a timestamp.
  fireKey: number | string;
  onDone?: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const duration = DURATION_MS[intensity];

  // Re-generate the particle field every time fireKey changes, so each
  // burst looks slightly different — avoids the "same canned animation" feel.
  const particles = useMemo(
    () =>
      generateParticles(
        intensity,
        typeof fireKey === 'number' ? fireKey : fireKey.toString().length,
      ),
    [intensity, fireKey],
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      onDone?.();
      return;
    }
    const t = window.setTimeout(() => onDone?.(), duration);
    return () => window.clearTimeout(t);
  }, [duration, fireKey, prefersReducedMotion, onDone]);

  if (prefersReducedMotion) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-testid="step-celebration"
    >
      <div className="absolute left-1/2 top-1/3 -translate-x-1/2">
        {particles.map((p) => (
          <motion.span
            key={`${fireKey}-${p.id}`}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
            animate={{
              x: p.x,
              y: p.y,
              opacity: 0,
              rotate: p.rotate,
              scale: 1,
            }}
            transition={{
              duration: duration / 1000,
              delay: p.delay,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size * 0.4,
              backgroundColor: p.color,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
