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
        sans: [
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
    },
  },
  plugins: [animate],
};

export default preset;
