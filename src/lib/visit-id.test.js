import { describe, it, expect, afterEach, vi } from 'vitest';

// Both flags are read at import time (Next inlines them), so each case imports
// a fresh copy with the world set the way it wants.
async function load({ anon = '1', visit = '1', consent = null } = {}) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_ANON_ANALYTICS = anon;
  process.env.NEXT_PUBLIC_VISIT_ID = visit;
  const local = new Map();
  const session = new Map();
  if (consent) local.set('cookie-consent', consent);
  const store = (m) => ({
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  });
  vi.stubGlobal('window', { localStorage: store(local), sessionStorage: store(session) });
  vi.stubGlobal('localStorage', window.localStorage);
  vi.stubGlobal('crypto', { randomUUID: () => '1111-2222' });
  const mod = await import('./visit-id.js');
  return { ...mod, local, session };
}

const originals = [process.env.NEXT_PUBLIC_ANON_ANALYTICS, process.env.NEXT_PUBLIC_VISIT_ID];
afterEach(() => {
  vi.unstubAllGlobals();
  [process.env.NEXT_PUBLIC_ANON_ANALYTICS, process.env.NEXT_PUBLIC_VISIT_ID] = originals;
});

describe('getVisitId', () => {
  it('is null while the flag is off, whatever else is true — the shipped default', async () => {
    const { getVisitId, session } = await load({ visit: '' });
    expect(getVisitId()).toBeNull();
    expect(session.size).toBe(0); // nothing written to the device
  });

  it('mints a tab-scoped id for a visitor who has not chosen', async () => {
    const { getVisitId, session, local } = await load();
    const id = getVisitId();
    expect(id).toBe('v-1111-2222');
    expect(session.get('pp-visit')).toBe(id);
    expect(local.size).toBe(0); // sessionStorage only: it cannot outlive the tab
  });

  it('marks the id so a consented session is never confused with a visit', async () => {
    const { getVisitId } = await load();
    expect(getVisitId().startsWith('v-')).toBe(true);
  });

  it('returns the same id for the rest of the tab', async () => {
    const { getVisitId } = await load();
    expect(getVisitId()).toBe(getVisitId());
  });

  it('gives a consented visitor none — they already have the real sid', async () => {
    const { getVisitId, session } = await load({ consent: 'accepted' });
    expect(getVisitId()).toBeNull();
    expect(session.size).toBe(0);
  });

  it('gives none when the anonymous layer itself is off', async () => {
    const { getVisitId } = await load({ anon: '' });
    expect(getVisitId()).toBeNull();
  });

  it('survives blocked storage by staying anonymous rather than throwing', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_ANON_ANALYTICS = '1';
    process.env.NEXT_PUBLIC_VISIT_ID = '1';
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null },
      sessionStorage: { getItem() { throw new Error('blocked'); }, setItem() {} },
    });
    vi.stubGlobal('localStorage', window.localStorage);
    const { getVisitId } = await import('./visit-id.js');
    expect(getVisitId()).toBeNull();
  });

  it('forgets the id when the visitor refuses', async () => {
    const { getVisitId, forgetVisitId, session } = await load();
    getVisitId();
    expect(session.has('pp-visit')).toBe(true);
    forgetVisitId();
    expect(session.has('pp-visit')).toBe(false);
  });
});
