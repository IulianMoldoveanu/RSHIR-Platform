// Root ESLint config — apps and packages extend their own config-eslint preset.
// This root config exists so `pnpm lint` at the repo root has something to read.
export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**'],
  },
];
