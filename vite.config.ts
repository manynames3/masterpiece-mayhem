import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
