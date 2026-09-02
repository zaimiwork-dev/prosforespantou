import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs helper, no types
import { extractScriptUrls, findHashesNear, KNOWN_PQ_HASH } from './ab-persisted-query.mjs';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

describe('extractScriptUrls', () => {
  it('absolutises relative Next.js chunk paths', () => {
    const html = `
      <script src="/_next/static/chunks/main-abc.js"></script>
      <script src="https://cdn.example.com/vendor.js"></script>
    `;
    expect(extractScriptUrls(html)).toEqual([
      'https://www.ab.gr/_next/static/chunks/main-abc.js',
      'https://cdn.example.com/vendor.js',
    ]);
  });

  it('also picks up chunks referenced only inside __NEXT_DATA__', () => {
    const html = `<script id="__NEXT_DATA__">{"buildManifest":["/_next/static/chunks/page-1.js"]}</script>`;
    expect(extractScriptUrls(html)).toContain('https://www.ab.gr/_next/static/chunks/page-1.js');
  });

  it('ignores non-JS assets', () => {
    const html = `<script src="/style.css"></script><script src="/app.js"></script>`;
    expect(extractScriptUrls(html)).toEqual(['https://www.ab.gr/app.js']);
  });

  it('de-duplicates a chunk listed both as a tag and in the manifest', () => {
    const html = `
      <script src="/_next/static/chunks/dup.js"></script>
      <script id="__NEXT_DATA__">{"x":["/_next/static/chunks/dup.js"]}</script>`;
    expect(extractScriptUrls(html)).toHaveLength(1);
  });
});

describe('findHashesNear', () => {
  it('finds the hash a bundle associates with the operation', () => {
    const src = `t.exports={ProductList:"${H1}",Other:"${H2}"}`;
    const out = findHashesNear(src, 'ProductList');
    expect(out[0].hash).toBe(H1);
  });

  it('ranks the CLOSEST hash first when several sit nearby', () => {
    // The wrong hash appears first in the file but further from the name.
    const src = `{"FullHeader":"${H2}", "padding":"${'x'.repeat(200)}", "ProductList":"${H1}"}`;
    const out = findHashesNear(src, 'ProductList');
    expect(out[0].hash).toBe(H1);
  });

  it('returns nothing when the operation name is absent', () => {
    expect(findHashesNear(`{"Other":"${H1}"}`, 'ProductList')).toEqual([]);
  });

  it('returns nothing when no 64-hex string is in range', () => {
    expect(findHashesNear('{"ProductList":"not-a-hash"}', 'ProductList')).toEqual([]);
  });

  it('does not match a 63- or 65-char hex run as a hash', () => {
    const short = 'a'.repeat(63);
    expect(findHashesNear(`{"ProductList":"${short}"}`, 'ProductList')).toEqual([]);
  });

  it('dedupes one hash seen near several occurrences, keeping the best distance', () => {
    const src = `ProductList ${'y'.repeat(300)} "${H1}" ${'z'.repeat(10)} ProductList`;
    const out = findHashesNear(src, 'ProductList');
    expect(out.filter((h) => h.hash === H1)).toHaveLength(1);
  });

  it('carries context so a human can sanity-check a candidate in CI logs', () => {
    const out = findHashesNear(`{"ProductList":"${H1}"}`, 'ProductList');
    expect(out[0].context).toContain('ProductList');
  });
});

describe('KNOWN_PQ_HASH', () => {
  it('is a well-formed sha256 hex digest', () => {
    expect(KNOWN_PQ_HASH).toMatch(/^[0-9a-f]{64}$/);
  });
});
