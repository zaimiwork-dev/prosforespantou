import { describe, it, expect } from 'vitest';
import { buildProfileSnapshot, snapshotFingerprint, PROFILE_LIMITS } from './profile-snapshot.js';
import { syncProfileSchema, deleteProfileSchema } from './validations/profile';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('buildProfileSnapshot', () => {
  it('keeps declared prefs, favorites and list lines as small records', () => {
    const snap = buildProfileSnapshot(
      {
        preferredStores: ['lidl', 'ab', 'lidl', ''],
        preferredCategories: ['Κάβα'],
        favorites: [{ key: `p:${uuid(1)}`, productId: uuid(1), productName: 'ΔΕΛΤΑ Γάλα 1lt', supermarket: 'ab' }],
        items: [{ id: uuid(2), productName: 'x', discountedPrice: 1.2, quantity: 3, supermarket: 'lidl', product: { name: 'big object' } }],
      },
      { updatedAt: 5, categories: { 'Κάβα': 2.123456 }, brands: {} },
      'large',
    );
    expect(snap).toEqual({
      preferredStores: ['lidl', 'ab'],
      preferredCategories: ['Κάβα'],
      favorites: [{ key: `p:${uuid(1)}`, productId: uuid(1), productName: 'ΔΕΛΤΑ Γάλα 1lt', supermarket: 'ab' }],
      listItems: [{ discountId: uuid(2), productId: null, supermarket: 'lidl', quantity: 3 }],
      interests: { updatedAt: 5, categories: { 'Κάβα': 2.123 }, brands: {} },
      textSize: 'large',
    });
  });

  it('caps every list and drops malformed rows', () => {
    const items = Array.from({ length: PROFILE_LIMITS.listItems + 20 }, (_, i) => ({ id: uuid(i), quantity: 500 }));
    const snap = buildProfileSnapshot({ items: [...items, { id: 'not-a-uuid' }], favorites: [{ key: '' }] }, {});
    expect(snap.listItems).toHaveLength(PROFILE_LIMITS.listItems);
    expect(snap.listItems[0].quantity).toBe(99);
    expect(snap.favorites).toEqual([]);
    expect(snap.textSize).toBe('normal');
  });

  it('keeps only the strongest interest keys', () => {
    const categories = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`c${i}`, i + 1]));
    const snap = buildProfileSnapshot({}, { categories });
    expect(Object.keys(snap.interests.categories)).toHaveLength(PROFILE_LIMITS.interestKeys);
    expect(snap.interests.categories.c79).toBe(80);
    expect(snap.interests.categories.c0).toBeUndefined();
  });

  it('every snapshot it builds passes the server schema', () => {
    const snap = buildProfileSnapshot(
      { preferredStores: ['ab'], favorites: [{ key: 'n:γάλα|ab', productName: 'Γάλα' }], items: [{ id: uuid(9) }] },
      { updatedAt: 1, categories: { a: 1 }, brands: { b: 2 } },
    );
    expect(syncProfileSchema.safeParse({ profileId: uuid(7), ...snap }).success).toBe(true);
  });
});

describe('snapshotFingerprint', () => {
  it('ignores the interest decay clock but not real changes', () => {
    const a = buildProfileSnapshot({ preferredStores: ['ab'] }, { updatedAt: 1, categories: { x: 1 } });
    const b = buildProfileSnapshot({ preferredStores: ['ab'] }, { updatedAt: 999, categories: { x: 1 } });
    const c = buildProfileSnapshot({ preferredStores: ['ab', 'lidl'] }, { updatedAt: 1, categories: { x: 1 } });
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(b));
    expect(snapshotFingerprint(a)).not.toBe(snapshotFingerprint(c));
  });
});

describe('profile schemas refuse oversized or foreign input', () => {
  it('rejects too many stores, a bad id, and an unknown text size', () => {
    const base = buildProfileSnapshot({}, {});
    expect(syncProfileSchema.safeParse({ profileId: uuid(1), ...base, preferredStores: Array(21).fill('ab') }).success).toBe(false);
    expect(syncProfileSchema.safeParse({ profileId: 'nope', ...base }).success).toBe(false);
    expect(syncProfileSchema.safeParse({ profileId: uuid(1), ...base, textSize: 'huge' }).success).toBe(false);
    expect(deleteProfileSchema.safeParse({ profileId: uuid(1) }).success).toBe(true);
  });
});
