import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    // Only unit tests — e2e specs under tests/e2e/ are run by Playwright.
    include: ['tests/*.spec.ts'],
    globals: false,
  },
});
