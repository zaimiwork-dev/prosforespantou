import { describe, it, expect } from 'vitest';
import { dedupeDeals } from './dedupe-deals';

const deal = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  productId: null,
  productName: 'x',
  supermarket: 'chain',
  discountedPrice: 1,
  ...over,
});

describe('dedupeDeals', () => {
  it('collapses same product+chain (multi-source rows) keeping the cheaper price', () => {
    const a = deal({ id: 'a', productId: 'p1', supermarket: 'masoutis', discountedPrice: 2.0 });
    const b = deal({ id: 'b', productId: 'p1', supermarket: 'masoutis', discountedPrice: 1.8 });
    const out = dedupeDeals([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('b');
  });

  it('keeps the same product at different chains by default (comparison views)', () => {
    const a = deal({ id: 'a', productId: 'p1', supermarket: 'mymarket', discountedPrice: 2.04 });
    const b = deal({ id: 'b', productId: 'p1', supermarket: 'masoutis', discountedPrice: 1.91 });
    expect(dedupeDeals([a, b])).toHaveLength(2);
  });

  it('does not collapse different quantities mis-mapped to one product at one chain', () => {
    const a = deal({ id: 'a', productId: 'p1', productName: 'Barilla Πένες 500g', supermarket: 'mymarket' });
    const b = deal({ id: 'b', productId: 'p1', productName: 'Barilla Πένες 400g', supermarket: 'mymarket' });
    expect(dedupeDeals([a, b])).toHaveLength(2);
  });

  it('crossChain: same product across chains → single card, cheapest chain wins the slot', () => {
    // The Μεβγάλ case: My Market row ranks first (higher hotScore) but
    // Masoutis sells the identical product 0.13€ cheaper.
    const pricierFirst = deal({ id: 'mm', productId: 'p1', productName: 'Μεβγάλ Γάλα Protein Μπανάνα 330ml', supermarket: 'mymarket', discountedPrice: 2.04 });
    const cheaper = deal({ id: 'mas', productId: 'p1', productName: 'Μεβγάλ High Protein Ρόφημα Γάλακτος Μπανάνα 330ml.', supermarket: 'masoutis', discountedPrice: 1.91 });
    const out = dedupeDeals([pricierFirst, cheaper], { crossChain: true });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('mas');
  });

  it('crossChain: identical name across chains collapses even without a shared productId', () => {
    const a = deal({ id: 'a', productId: 'p1', productName: 'Coca Cola 330ml', supermarket: 'ab', discountedPrice: 0.9 });
    const b = deal({ id: 'b', productId: 'p2', productName: 'Coca Cola 330ml', supermarket: 'kritikos', discountedPrice: 0.8 });
    const out = dedupeDeals([a, b], { crossChain: true });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('b');
  });

  it('crossChain: does not collapse different variants sharing a stale productId', () => {
    const regular = deal({ id: 'regular', productId: 'p1', productName: 'Fanta Πορτοκαλάδα 6x330ml', supermarket: 'kritikos', discountedPrice: 3.98 });
    const zero = deal({ id: 'zero', productId: 'p1', productName: 'Fanta Πορτοκαλάδα Zero 6x330ml', supermarket: 'mymarket', discountedPrice: 3.6 });
    expect(dedupeDeals([regular, zero], { crossChain: true })).toHaveLength(2);
  });

  it('crossChain: different products at different chains all stay', () => {
    const a = deal({ id: 'a', productId: 'p1', productName: 'Φέτα 400γρ', supermarket: 'ab' });
    const b = deal({ id: 'b', productId: 'p2', productName: 'Γάλα 1L', supermarket: 'kritikos' });
    expect(dedupeDeals([a, b], { crossChain: true })).toHaveLength(2);
  });

  it('rows without productId or name never collapse with each other', () => {
    const a = deal({ id: 'a', productId: null, productName: null });
    const b = deal({ id: 'b', productId: null, productName: null });
    expect(dedupeDeals([a, b], { crossChain: true })).toHaveLength(2);
  });

  it('first occurrence keeps the (ranked) slot position', () => {
    const top = deal({ id: 'top', productId: 'p1', productName: 'A', supermarket: 'mymarket', discountedPrice: 2 });
    const mid = deal({ id: 'mid', productId: 'p9', productName: 'B', supermarket: 'ab', discountedPrice: 5 });
    const dupe = deal({ id: 'dupe', productId: 'p1', productName: 'A', supermarket: 'masoutis', discountedPrice: 1 });
    const out = dedupeDeals([top, mid, dupe], { crossChain: true });
    expect(out.map((d) => d.id)).toEqual(['dupe', 'mid']);
  });
});
