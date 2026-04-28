import type { Config } from 'tailwindcss';
import preset from '@hir/ui/tailwind-preset';

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/**/*.{ts,tsx}',
  ],
};

export default config;
