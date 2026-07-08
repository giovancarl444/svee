import { defineConfig } from 'vitest/config';

// Each test spins up an in-WASM Postgres (PGlite) and runs migrations. Run the
// files serially and give them room so concurrent instances don't contend and
// time out.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
