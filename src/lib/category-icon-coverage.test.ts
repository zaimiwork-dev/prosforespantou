import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from './constants.js';

// The icons replaced emoji on 2026-09-16. A department with no entry in the
// map does not fail loudly — it silently renders the «Άλλο» parcel, which is
// exactly the kind of thing nobody notices until a shopper asks why «Κάβα»
// looks like a box. The map lives inside a .js component with JSX, and the
// vitest environment is plain node, so this reads the source rather than
// importing it: enough to prove every key exists.
const SRC = fs.readFileSync(path.join(process.cwd(), 'src/components/CategoryIcon.js'), 'utf8');
const AISLES = fs.readFileSync(path.join(process.cwd(), 'src/lib/supermarket-aisles.ts'), 'utf8');

const iconKeys = [...SRC.matchAll(/^ {2}'([^']+)': \(/gm)].map((m) => m[1]);

describe('CategoryIcon covers every department', () => {
  it('has an icon for each CATEGORIES id except «all»', () => {
    const missing = CATEGORIES.map((c: { id: string }) => c.id)
      .filter((id) => id !== 'all' && !iconKeys.includes(id));
    expect(missing).toEqual([]);
  });

  it('has an icon for every aisle the supermarket page can render', () => {
    const aisleIcons = [...AISLES.matchAll(/icon: '([^']+)'/g)].map((m) => m[1]);
    expect(aisleIcons.length).toBeGreaterThan(20);
    expect(aisleIcons.filter((k) => !iconKeys.includes(k))).toEqual([]);
  });

  it('draws every icon with real geometry — no empty fragments', () => {
    expect(iconKeys.length).toBe(17);
    for (const key of iconKeys) {
      const block = SRC.slice(SRC.indexOf(`  '${key}': (`));
      const body = block.slice(0, block.indexOf('  ),'));
      expect(body, key).toMatch(/<(path|circle|ellipse|rect)\b/);
    }
  });

  it('keeps emoji out of the icon set and the interface glyphs', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    const iconsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/Icons.js'), 'utf8');
    // The comment in Icons.js lists the emoji it replaced; strip comments first.
    const stripped = (s: string) => s.replace(/\/\/[^\n]*/g, '');
    expect(emoji.test(stripped(SRC))).toBe(false);
    expect(emoji.test(stripped(iconsSrc))).toBe(false);
  });
});
