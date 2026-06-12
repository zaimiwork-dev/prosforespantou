import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { resolveStorageConfig, mirrorPathFor, publicUrlFor, BUCKET } from './mirror-images.mjs';

describe('resolveStorageConfig', () => {
  it('returns null when the service key is missing', () => {
    expect(resolveStorageConfig({ SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
  });

  it('returns null when no URL is available', () => {
    expect(resolveStorageConfig({ SUPABASE_SERVICE_ROLE_KEY: 'k' })).toBeNull();
  });

  it('falls back to NEXT_PUBLIC_SUPABASE_URL', () => {
    const cfg = resolveStorageConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://ref.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    expect(cfg).toEqual({ url: 'https://ref.supabase.co', key: 'k' });
  });

  it('prefers SUPABASE_URL and strips trailing slashes', () => {
    const cfg = resolveStorageConfig({
      SUPABASE_URL: 'https://a.supabase.co//',
      NEXT_PUBLIC_SUPABASE_URL: 'https://b.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    expect(cfg!.url).toBe('https://a.supabase.co');
  });
});

describe('mirrorPathFor', () => {
  const abUrl = 'https://www.ab.gr/medias/sys_master/products/h2c/hdf/10338798665758.jpg';

  it('is deterministic — same URL, same path across runs', () => {
    expect(mirrorPathFor('ab', abUrl)).toBe(mirrorPathFor('ab', abUrl));
  });

  it('namespaces by chain and keeps the source extension', () => {
    const p = mirrorPathFor('ab', abUrl);
    expect(p).toMatch(/^ab\/[0-9a-f]{20}\.jpg$/);
  });

  it('differs for different source URLs', () => {
    const other = 'https://www.ab.gr/medias/sys_master/ha2/h84/9713221894174.jpg';
    expect(mirrorPathFor('ab', abUrl)).not.toBe(mirrorPathFor('ab', other));
  });

  it('normalizes uppercase extensions and supports png/webp', () => {
    expect(mirrorPathFor('ab', 'https://x.gr/a/B.PNG')).toMatch(/\.png$/);
    expect(mirrorPathFor('ab', 'https://x.gr/a/b.webp')).toMatch(/\.webp$/);
  });

  it('defaults to .jpg for extension-less or unparseable URLs', () => {
    expect(mirrorPathFor('ab', 'https://x.gr/medias/noext')).toMatch(/\.jpg$/);
    expect(mirrorPathFor('ab', 'not a url at all')).toMatch(/^ab\/[0-9a-f]{20}\.jpg$/);
  });
});

describe('publicUrlFor', () => {
  it('builds the public-bucket URL', () => {
    expect(publicUrlFor('https://ref.supabase.co', 'ab/abc.jpg')).toBe(
      `https://ref.supabase.co/storage/v1/object/public/${BUCKET}/ab/abc.jpg`
    );
  });
});
