import { defineConfig } from 'vitest/config';

// Canonical full-suite config: run `npx vitest run` from the repo root.
// Scopes vitest to real source tests only — the default scan would pick up
// compiled backend/dist/*.test.js copies, the stale $BACKUP_DIR folder and
// one-shot backend/exports stubs, double-counting tests and failing on
// stale artifacts. Backend owns the deeper scoping via backend/vitest.config.ts.
export default defineConfig({
  test: {
    include: [
      'backend/src/**/*.test.ts',
      'frontend/src/**/*.test.ts',
      'frontend/src/**/*.test.tsx',
    ],
    exclude: [
      'node_modules/**',
      '**/dist/**',
      '**/$BACKUP_DIR/**',
      'backend/exports/**',
    ],
  },
});
