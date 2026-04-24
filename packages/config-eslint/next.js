// Shared ESLint flat config for Next.js apps in hir-platform.
// Apps consume via `eslint.config.mjs` -> `import nextConfig from '@hir/config-eslint/next';`
export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**', '**/*.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      // Sprint 1: keep linting permissive. Tightened in later sprints.
    },
  },
];
