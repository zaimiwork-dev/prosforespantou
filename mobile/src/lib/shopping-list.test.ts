// vi.mock calls are hoisted by vitest; the imports below them are intentional.
/* eslint-disable import/first */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
vi.mock('./analytics', () => ({ track: () => {} }));

import { buildShareText, groupByChain, isExpired, type ListItem } from './shopping-list';

const item = (o: Partial<ListItem>): ListItem => ({
  id: 'x', productId: null, name: 'Γάλα', chain: 'ab', price: 2, imageUrl: null,
  validUntil: '2999-01-01T00:00:00Z', datesFromSource: true, quantity: 1, checked: false, ...o,
});
const NOW = Date.parse('2026-11-11T12:00:00Z');

describe('isExpired', () => {
  it('only counts dates the chain published', () => {
    expect(isExpired({ validUntil: '2026-11-01T00:00:00Z', datesFromSource: true }, NOW)).toBe(true);
    expect(isExpired({ validUntil: '2026-11-01T00:00:00Z', datesFromSource: false }, NOW)).toBe(false);
    expect(isExpired({ validUntil: '2026-12-01T00:00:00Z', datesFromSource: true }, NOW)).toBe(false);
    expect(isExpired({ validUntil: 'garbage', datesFromSource: true }, NOW)).toBe(false);
  });
});

describe('groupByChain', () => {
  it('groups, sums with quantity and sorts the biggest subtotal first', () => {
    const { groups, total } = groupByChain(
      [item({ id: '1', chain: 'ab', price: 2, quantity: 2 }), item({ id: '2', chain: 'lidl', price: 10 }), item({ id: '3', chain: 'ab', price: 1 })],
      NOW,
    );
    expect(groups.map((g) => g.chain)).toEqual(['lidl', 'ab']);
    expect(groups[1].subtotal).toBe(5);
    expect(total).toBe(15);
  });
  it('lists an expired offer but does not count it', () => {
    const { groups, total } = groupByChain([item({ validUntil: '2026-11-01T00:00:00Z', price: 9 })], NOW);
    expect(groups[0].items).toHaveLength(1);
    expect(total).toBe(0);
  });
});

describe('buildShareText', () => {
  it('writes the website layout with the chain name and the total', () => {
    const text = buildShareText([item({ quantity: 2, price: 1.5 })], () => 'ΑΒ Βασιλόπουλος');
    expect(text).toContain('• 2x Γάλα (ΑΒ Βασιλόπουλος) - 3.00€');
    expect(text).toContain('Σύνολο: 3.00€');
    expect(text.startsWith('ΠΡΟΣΦΟΡΕΣ ΠΑΝΤΟΥ')).toBe(true);
  });
  it('is empty when everything has expired', () => {
    expect(buildShareText([item({ validUntil: '2000-01-01T00:00:00Z' })], () => 'x')).toBe('');
  });
});
