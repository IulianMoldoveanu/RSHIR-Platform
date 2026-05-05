import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Match the tsconfig `@/*` baseUrl mapping so route.ts imports resolve
      // under vitest the same way they do under next.
      '@': path.resolve(__dirname, 'src'),
      // Next's `import 'server-only'` throws when bundled into a client
      // component. Stub it under vitest so route.ts files can be imported
      // directly in tests.
      'server-only': path.resolve(__dirname, 'src/test/server-only-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
});
