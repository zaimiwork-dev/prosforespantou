import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // mobile/ is the Expo app: its own runtime, its own tests.
    // .claude/worktrees holds engineers' checkouts: their copies of every test
    // would run too (the count doubled on 2026-11-04).
    exclude: ['**/node_modules/**', 'mobile/**', '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
