import type { Config } from 'tailwindcss';
import preset from '@hir/ui/tailwind-preset';

const config: Config = {
  presets: [preset as Partial<Config>],
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
