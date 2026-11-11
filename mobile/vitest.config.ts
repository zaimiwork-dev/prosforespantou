// Unit tests for the app's pure logic (formatting, stores, list maths). Screens
// are checked by type-check, lint, export and screenshots (TEAM.md); the
// website's own vitest run excludes mobile/.
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/lib'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
