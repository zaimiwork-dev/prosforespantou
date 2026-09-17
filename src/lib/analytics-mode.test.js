import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The module reads NEXT_PUBLIC_ANON_ANALYTICS at import time (Next inlines it),
// so each case imports a fresh copy with the flag set the way it wants.
async function loadMode(flag, consent) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_ANON_ANALYTICS = flag;
  const store = new Map();
  if (consent) store.set('cookie-consent', consent);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  });
  vi.stubGlobal('localStorage', window.localStorage);
  const mod = await import('./analytics-mode.js');
  return mod;
}

const original = process.env.NEXT_PUBLIC_ANON_ANALYTICS;

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.NEXT_PUBLIC_ANON_ANALYTICS = original;
});

describe('analyticsMode', () => {
  it('records nothing before consent while the flag is off — the five-month status quo', async () => {
    const { analyticsMode } = await loadMode('', null);
    expect(analyticsMode()).toBe('off');
  });

  it('still records nothing after an explicit reject while the flag is off', async () => {
    const { analyticsMode } = await loadMode('', 'rejected');
    expect(analyticsMode()).toBe('off');
  });

  it('measures anonymously before a choice once the flag is on', async () => {
    const { analyticsMode } = await loadMode('1', null);
    expect(analyticsMode()).toBe('anonymous');
  });

  it('keeps measuring anonymously after a reject — the reject is about the device, not the count', async () => {
    const { analyticsMode } = await loadMode('1', 'rejected');
    expect(analyticsMode()).toBe('anonymous');
  });

  it('upgrades to the identified mode on accept', async () => {
    const { analyticsMode } = await loadMode('1', 'accepted');
    expect(analyticsMode()).toBe('identified');
  });

  it('honours an accept even with the flag off, so consent is never downgraded', async () => {
    const { analyticsMode } = await loadMode('', 'accepted');
    expect(analyticsMode()).toBe('identified');
  });

  it('is off during server rendering, whatever the flag says', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_ANON_ANALYTICS = '1';
    vi.stubGlobal('window', undefined);
    const { analyticsMode } = await import('./analytics-mode.js');
    expect(analyticsMode()).toBe('off');
  });

  it('marks only the anonymous mode as storage-free', async () => {
    const { isAnonymous } = await loadMode('1', null);
    expect(isAnonymous('anonymous')).toBe(true);
    expect(isAnonymous('identified')).toBe(false);
    expect(isAnonymous('off')).toBe(false);
  });
});
