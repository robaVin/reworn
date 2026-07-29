import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  // Use React's automatic JSX runtime so component modules render in tests
  // (e.g. react-dom/server) without a manual `import React`.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // Mirrors the `@/*` path mapping in tsconfig.json. Declared directly
      // rather than via vite-tsconfig-paths, which is ESM-only and cannot be
      // loaded by this CommonJS config.
      '@': srcPath,

      // The real `server-only` package throws outside a React Server
      // Components graph, which would make server modules untestable.
      // The production guard is unaffected — see tests/stubs/server-only.ts.
      'server-only': fileURLToPath(
        new URL('./tests/stubs/server-only.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Playwright owns tests/e2e.
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/modules/**', 'src/lib/**'],
    },
  },
});
