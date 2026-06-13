import { describe, it, expect, afterEach } from 'vitest';
import { getGlobalDispatcher, setGlobalDispatcher } from 'undici';
// @ts-expect-error — plain .mjs module without type declarations
import { installProxyFromEnv, maskProxyUrl, _resetForTest } from './proxy-fetch.mjs';

describe('maskProxyUrl', () => {
  it('strips credentials, keeping protocol + host', () => {
    expect(maskProxyUrl('http://user:pass@proxy.example.com:8080')).toBe('http://proxy.example.com:8080');
  });

  it('is safe on an unparseable value', () => {
    expect(maskProxyUrl('not a url')).toBe('(unparseable PROXY_URL)');
  });
});

describe('installProxyFromEnv', () => {
  afterEach(() => _resetForTest());

  it('is a no-op when PROXY_URL is unset (global dispatcher untouched)', () => {
    const before = getGlobalDispatcher();
    expect(installProxyFromEnv({})).toEqual({ enabled: false, url: null });
    expect(getGlobalDispatcher()).toBe(before);
  });

  it('installs once and is idempotent when PROXY_URL is set', () => {
    const original = getGlobalDispatcher();
    try {
      const first = installProxyFromEnv({ PROXY_URL: 'http://u:p@127.0.0.1:9999' });
      expect(first.enabled).toBe(true);
      const installed = getGlobalDispatcher();
      expect(installed).not.toBe(original); // a ProxyAgent is now in place

      // Second call doesn't re-install (guarded), dispatcher stays the same.
      installProxyFromEnv({ PROXY_URL: 'http://u:p@127.0.0.1:9999' });
      expect(getGlobalDispatcher()).toBe(installed);
    } finally {
      setGlobalDispatcher(original); // never leak a proxy into other tests
    }
  });
});
