// Unit tests for the app's pure logic (formatting, stores, list maths). Screens
// are checked by type-check, lint, export and screenshots (TEAM.md); the
// website's own vitest run excludes mobile/.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Windows: a shell whose working directory is spelled «c:\…» makes vitest load
// its runner twice (once per drive-letter case) and every file fails at its
// first describe with «Cannot read properties of undefined (reading
// 'config')». `npm test` goes through scripts/test.mjs, which fixes the
// working directory first; paths here are upper-cased for the same reason.
const upper = (p: string) => p.replace(/^[a-z]:/, (d) => d.toUpperCase());
const dir = (rel: string) => upper(fileURLToPath(new URL(rel, import.meta.url)));

export default defineConfig({
  root: dir('.'),
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: {
    // The app's two import aliases (tsconfig paths): '@/…' and '@shared/…',
    // and a stand-in for react-native itself (see test/react-native-stub.ts).
    alias: [
      { find: /^@shared\//, replacement: dir('../src/lib/') },
      { find: /^@\//, replacement: dir('./src/') },
      { find: /^react-native$/, replacement: dir('./test/react-native-stub.ts') },
    ],
  },
});
