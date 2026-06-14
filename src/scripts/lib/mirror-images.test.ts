import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { resolveStorageConfig, mirrorImages, mirrorPathFor, publicUrlFor, BUCKET } from './mirror-images.mjs';

const originalFetch = globalThis.fetch;

function okText() {
  return new Response('', { status: 200 });
}

function missing() {
  return new Response('', { status: 404 });
}

function image() {
  return new Response(new Uint8Array(128), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://ref.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  delete process.env.MIRROR_CONCURRENCY;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalFetch) globalThis.fetch = originalFetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.MIRROR_CONCURRENCY;
});

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

describe('mirrorImages', () => {
  it('mirrors with concurrent workers without exceeding maxNew', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/storage/v1/bucket')) return okText();
      if (init?.method === 'HEAD') return missing();
      if (href.includes('/storage/v1/object/chain-images/')) return okText();
      if (href.startsWith('https://source.test/')) return image();
      throw new Error(`unexpected fetch ${href}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const items = Array.from({ length: 5 }, (_, i) => ({ imageUrl: `https://source.test/${i}.jpg` }));

    const result = await mirrorImages({
      chain: 'test',
      items,
      match: (u: string) => u.includes('source.test'),
      maxNew: 2,
      paceMs: 0,
      concurrency: 4,
    });

    const uploads = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/storage/v1/object/chain-images/')
    );
    expect(result).toMatchObject({ enabled: true, attempted: 5, mirrored: 2, reused: 0, failed: 0, skipped: 3 });
    expect(uploads).toHaveLength(2);
    expect(items.filter((it) => it.imageUrl.includes('/storage/v1/object/public/chain-images/test/'))).toHaveLength(2);
  });

  it('does not count already mirrored HEAD hits against maxNew', async () => {
    const reusedPath = mirrorPathFor('test', 'https://source.test/already.jpg');
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/storage/v1/bucket')) return okText();
      if (init?.method === 'HEAD') return href.includes(reusedPath) ? okText() : missing();
      if (href.includes('/storage/v1/object/chain-images/')) return okText();
      if (href.startsWith('https://source.test/')) return image();
      throw new Error(`unexpected fetch ${href}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const items = [
      { imageUrl: 'https://source.test/already.jpg' },
      { imageUrl: 'https://source.test/new.jpg' },
      { imageUrl: 'https://source.test/deferred.jpg' },
    ];

    const result = await mirrorImages({
      chain: 'test',
      items,
      match: (u: string) => u.includes('source.test'),
      maxNew: 1,
      paceMs: 0,
      concurrency: 3,
    });

    const uploads = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/storage/v1/object/chain-images/')
    );
    expect(result).toMatchObject({ enabled: true, attempted: 3, mirrored: 1, reused: 1, failed: 0, skipped: 1 });
    expect(uploads).toHaveLength(1);
    expect(items[0].imageUrl).toBe(publicUrlFor('https://ref.supabase.co', reusedPath));
  });
});
