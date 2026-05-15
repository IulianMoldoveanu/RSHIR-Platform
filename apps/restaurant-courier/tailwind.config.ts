import type { Config } from 'tailwindcss';
import preset from '@hir/ui/tailwind-preset';

const config: Config = {
  presets: [preset as Partial<Config>],
  // Class-based dark mode: ThemeProvider toggles `class="dark"` on <html>.
  // Default is dark (the inline script in the root layout sets the class
  // before paint so the chosen theme is applied without a FOUC).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens backed by CSS variables defined in globals.css.
        // The body uses these directly. Per-component zinc-* values are
        // migrated incrementally in follow-up PRs; this PR ships only
        // the chrome (body bg + fg) so the toggle has a visible effect
        // without a 200-file repaint up front.
        'hir-bg': 'rgb(var(--hir-bg) / <alpha-value>)',
        'hir-fg': 'rgb(var(--hir-fg) / <alpha-value>)',
        'hir-surface': 'rgb(var(--hir-surface) / <alpha-value>)',
        'hir-border': 'rgb(var(--hir-border) / <alpha-value>)',
        'hir-muted-fg': 'rgb(var(--hir-muted-fg) / <alpha-value>)',
        'hir-accent': 'rgb(var(--hir-accent) / <alpha-value>)',
      },
    },
  },
  content: [
    './src/**/*.{ts,tsx}',
    // Scope @hir/ui scan to source folders only — the bare `**` glob also
    // matched `packages/ui/node_modules` and Tailwind printed a warning on
    // every build ("pattern looks like it's matching all of node_modules").
    '../../packages/ui/components/**/*.{ts,tsx}',
    '../../packages/ui/lib/**/*.{ts,tsx}',
    '../../packages/ui/index.ts',
  ],
};

export default config;
