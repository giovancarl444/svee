import { defineConfig } from 'vitest/config';

// The pipeline test spins up an in-WASM Postgres (PGlite) — run serially with room.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
