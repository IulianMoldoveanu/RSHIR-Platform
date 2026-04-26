// Shared Tailwind preset for HIR apps. Apps consume via:
//   presets: [require('@hir/ui/tailwind-preset')]
//
// Design language: zinc-based, no CSS vars. Keeps Sprint 1 simple.
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const preset: Partial<Config> = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        // Apps wire `next/font` (Inter) into html className with
        // variable: '--font-sans'; we fall back to the system stack so
        // first paint never sees an unstyled Times-New-Roman.
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      keyframes: {
        // Shimmer overlay for skeleton loaders. The :before pseudo is a
        // translucent gradient strip; we slide it across the element via
        // translateX(-100% → 200%) for a soft shine. Paired with
        // animate-pulse so reduced-motion still gets the gentle opacity
        // pulse via Tailwind's motion-reduce: variant on the :before.
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [animate],
};

export default preset;
