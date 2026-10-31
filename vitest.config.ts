import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
    // The in-memory MongoDB and the seeded catalog are slow to boot; give the
    // suite room to breathe without letting a hung test run forever.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Tests share one database, so they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    // `test.env` is applied before any module is imported. Setting these inside
    // a setup file would be too late — `config/env.ts` reads process.env the
    // moment it is first evaluated.
    env: {
      NODE_ENV: 'test',
      MONGODB_MEMORY: 'true',
      LOG_LEVEL: 'error',
      COD_ENABLED: 'false',
      JWT_ACCESS_SECRET: 'test_access_secret_at_least_16_chars',
      JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_16_chars',
    },
  },
});
