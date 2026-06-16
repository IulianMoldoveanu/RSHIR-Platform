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
    // Co-located *.test.ts under src/** is supported for action-level units
    // (marketplace, future fleet flows). Top-level tests/*.spec.ts is the
    // historical pure-logic suite (auto-assign-score, courier-documents, etc.).
    include: ['tests/*.spec.ts', 'src/**/*.test.ts'],
    globals: false,
  },
});
