import { describe, expect, it, vi } from 'vitest';
import { MAX_VIEWED, clearRecentlyViewed, pushViewed, recordView, type ViewedOffer } from './recently-viewed';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));


const v = (id: string, viewedAt = 0): ViewedOffer => ({ id, productId: null, name: id, chain: 'ab', price: 1, imageUrl: null, viewedAt });

describe('pushViewed', () => {
  it('puts the newest first', () => {
    expect(pushViewed([v('a')], v('b')).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('de-duplicates by id, moving a re-opened offer to the top', () => {
    expect(pushViewed([v('a'), v('b'), v('c')], v('b', 9)).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
  it('keeps only the last 20', () => {
    let l: ViewedOffer[] = [];
    for (let i = 0; i < 25; i++) l = pushViewed(l, v(`o${i}`));
    expect(l).toHaveLength(MAX_VIEWED);
    expect(l[0].id).toBe('o24');
    expect(l[19].id).toBe('o5');
  });
});

describe('store', () => {
  it('records and clears', async () => {
    await recordView({ id: 'x', productId: 'p', name: 'X', title: 'Χ', chain: 'lidl', price: 2, imageUrl: null });
    await clearRecentlyViewed();
  });
});
