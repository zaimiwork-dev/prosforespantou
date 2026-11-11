import { describe, expect, it } from 'vitest';
import { balanceByChain, displayedSaving, orderDepartments, pickRail, popularIsMeaningful, POPULAR_MIN_SESSIONS, savingRank } from './feed-sections';

const row = (id: string, supermarket: string, productName: string, price = 1, productId: string | null = null) => ({
  id, supermarket, productName, discountedPrice: price, productId,
});

describe('pickRail', () => {
  it('caps each chain so one chain cannot fill the rail', () => {
    const pool = [
      row('a1', 'mymarket', 'Ariel Υγρό 1'), row('a2', 'mymarket', 'Skip Υγρό 2'), row('a3', 'mymarket', 'Dixan Υγρό 3'),
      row('a4', 'mymarket', 'Persil Υγρό 4'), row('b1', 'ab', 'Tide Υγρό 5'), row('c1', 'lidl', 'Formil Υγρό 6'),
    ];
    const rail = pickRail(pool, { limit: 5, seen: new Set(), perChain: 3 });
    expect(rail.map((d) => d.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'c1']);
  });

  it('fills past the cap rather than return a half rail', () => {
    const pool = ['Ariel', 'Skip', 'Dixan', 'Persil', 'Tide'].map((n, i) => row(`m${i}`, 'mymarket', `${n} Υγρό`));
    expect(pickRail(pool, { limit: 5, seen: new Set(), perChain: 3 })).toHaveLength(5);
  });

  it('never repeats an offer, or its product at another chain, from an earlier rail', () => {
    const seen = new Set<string>();
    const first = [row('x1', 'ab', 'Nescafe Classic 200g', 5, 'P1'), row('x2', 'ab', 'Lacta 85g'), row('x3', 'lidl', 'Milka 100g'), row('x4', 'ab', 'Misko Νο6')];
    pickRail(first, { limit: 4, seen });
    const second = [
      row('y1', 'kritikos', 'NESCAFE CLASSIC 200ΓΡ', 6, 'P1'), // same product, pricier chain
      row('x2', 'ab', 'Lacta 85g'),
      row('y2', 'ab', 'Barilla Penne'), row('y3', 'lidl', 'Combino Fusilli'), row('y4', 'ab', 'Melissa Κριθαράκι'), row('y5', 'ab', 'Knorr Ρύζι'),
    ];
    expect(pickRail(second, { limit: 6, seen }).map((d) => d.id)).toEqual(['y2', 'y3', 'y4', 'y5']);
  });

  it('keeps one row per brand family', () => {
    const pool = [
      row('1', 'ab', 'Babylino Sensitive No4'), row('2', 'ab', 'Babylino Sensitive No5'), row('3', 'ab', 'Pampers Premium'),
      row('4', 'lidl', 'Lupilu Πάνες'), row('5', 'ab', 'Libero Πάνες'),
    ];
    expect(pickRail(pool, { limit: 5, seen: new Set() }).map((d) => d.id)).toEqual(['1', '3', '4', '5']);
  });

  it('returns nothing, and marks nothing as seen, below the minimum', () => {
    const seen = new Set<string>();
    expect(pickRail([row('1', 'ab', 'Ariel'), row('2', 'ab', 'Skip')], { limit: 10, seen })).toEqual([]);
    expect(seen.size).toBe(0);
  });
});

describe('displayedSaving', () => {
  it('uses the chain-published was-price when there is one', () => {
    expect(displayedSaving({ discountedPrice: 2, originalPrice: 4, discountPercent: 50 })).toEqual({ percent: 50, euros: 2 });
    expect(displayedSaving({ discountedPrice: 3, originalPrice: 4 })).toEqual({ percent: 25, euros: 1 });
  });

  it('claims nothing without a was-price or a baseline the card would show', () => {
    expect(displayedSaving({ discountedPrice: 2 })).toBeNull();
    expect(displayedSaving({ discountedPrice: 2, originalPrice: 2 })).toBeNull();
  });
});

describe('orderDepartments', () => {
  it('puts the shopper\'s departments first, then the weekly shop\'s order, never «Άλλο»', () => {
    const order = orderDepartments(['Κάβα', 'not a department', 'Κάβα', 'Άλλο']);
    expect(order[0]).toEqual({ id: 'Κάβα', personal: true });
    expect(order[1]).toEqual({ id: 'Γαλακτοκομικά & Είδη Ψυγείου', personal: false });
    expect(order.some((d) => d.id === 'Άλλο')).toBe(false);
    expect(order.filter((d) => d.id === 'Κάβα')).toHaveLength(1);
  });
});

describe('balanceByChain', () => {
  it('keeps the best rows of each chain, in order, and no more', () => {
    const chainOf = (id: string) => (id[0] === 'm' ? 'mymarket' : id[0] === 'a' ? 'ab' : 'lidl');
    const rows = ['m1', 'm2', 'm3', 'a1', 'm4', 'l1'].map((id) => row(id, chainOf(id), id));
    expect(balanceByChain(rows, 2).map((d) => d.id)).toEqual(['m1', 'm2', 'a1', 'l1']);
  });
});

describe('savingRank', () => {
  it('lets a staple outrank a slightly bigger discount on personal care', () => {
    expect(savingRank(40, 'Γαλακτοκομικά & Είδη Ψυγείου')).toBeGreaterThan(savingRank(50, 'Προσωπική Φροντίδα'));
    expect(savingRank(30, 'unknown')).toBe(30);
  });
});

describe('popularIsMeaningful', () => {
  it('needs real traffic', () => {
    expect(popularIsMeaningful(5)).toBe(false);
    expect(popularIsMeaningful(POPULAR_MIN_SESSIONS)).toBe(true);
  });
});
