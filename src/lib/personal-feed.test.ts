import { describe, it, expect } from 'vitest';
import { rankPersonalFeed, personalScore, exploreSlots, savingSlots, STORE_BOOST, CHAIN_CAP } from './personal-feed';
import { EMPTY_PROFILE, bumpProfile } from './interest-profile';

const offer = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  supermarket: 'ab',
  category: 'Γαλακτοκομικά',
  productName: `Προϊόν ${id}`,
  ...over,
});

describe('personalScore', () => {
  it('boosts a preferred store without needing any profile', () => {
    const a = personalScore(offer('a'), EMPTY_PROFILE, [], ['ab']);
    const b = personalScore(offer('b', { supermarket: 'lidl' }), EMPTY_PROFILE, [], ['ab']);
    expect(a - b).toBe(STORE_BOOST);
  });

  it('a declared category still outweighs the store boost', () => {
    const elsewhere = personalScore(offer('a', { supermarket: 'lidl' }), EMPTY_PROFILE, ['Γαλακτοκομικά'], ['ab']);
    const preferred = personalScore(offer('b', { category: 'Κάβα' }), EMPTY_PROFILE, ['Γαλακτοκομικά'], ['ab']);
    expect(elsewhere).toBeGreaterThan(preferred);
  });

  it('counts cheapest-in-cluster', () => {
    expect(personalScore(offer('a', { isCheapestInCluster: true }), EMPTY_PROFILE, [], []))
      .toBeGreaterThan(personalScore(offer('b'), EMPTY_PROFILE, [], []));
  });
});

describe('rankPersonalFeed — stores boost, never filter', () => {
  it('keeps an offer from a non-preferred chain in the rail', () => {
    const deals = [offer('other', { supermarket: 'sklavenitis', productName: 'Αλφα Γιαούρτι' })];
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'] });
    expect(out.map((d) => d.id)).toEqual(['other']);
  });

  it('puts the preferred chain first when relevance ties', () => {
    const deals = [
      offer('far', { supermarket: 'lidl', productName: 'Βήτα Γάλα' }),
      offer('near', { supermarket: 'ab', productName: 'Άλφα Γάλα' }),
    ];
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'] });
    expect(out.map((d) => d.id)).toEqual(['near', 'far']);
  });

  it('a cheaper rival category the user declared outranks the preferred store', () => {
    const deals = [
      offer('preferred', { supermarket: 'ab', category: 'Κάβα', productName: 'Άλφα Κρασί' }),
      offer('declared', { supermarket: 'lidl', category: 'Γαλακτοκομικά', productName: 'Βήτα Γάλα' }),
    ];
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: ['Γαλακτοκομικά'], preferredStores: ['ab'] });
    expect(out[0].id).toBe('declared');
  });

  it('learned brands raise their offers', () => {
    const profile = bumpProfile(EMPTY_PROFILE, { category: 'Γαλακτοκομικά', productName: 'Δέλτα Γάλα' }, 4, Date.now());
    const deals = [
      offer('unknown', { productName: 'Όλυμπος Γάλα' }),
      offer('known', { productName: 'Δέλτα Γάλα Φρέσκο' }),
    ];
    const out = rankPersonalFeed({ deals, profile, declaredCategories: [], preferredStores: [] });
    expect(out[0].id).toBe('known');
  });
});

describe('rankPersonalFeed — family cap and exploration', () => {
  it('caps a brand at two rows', () => {
    const deals = ['1', '2', '3', '4'].map((n) => offer(`misko${n}`, { productName: `Μίσκο Μακαρόνια No${n}` }));
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: [] });
    expect(out).toHaveLength(2);
  });

  it('gives slot 10 to an offer outside the user categories', () => {
    const deals = Array.from({ length: 20 }, (_, i) => offer(`p${i}`, { productName: `Μάρκα${i} Γάλα` }));
    const explore = [offer('x', { category: 'Απορρυπαντικά', productName: 'Ντίξαν Σκόνη' })];
    const out = rankPersonalFeed({
      deals,
      explore,
      profile: EMPTY_PROFILE,
      declaredCategories: ['Γαλακτοκομικά'],
      preferredStores: ['ab'],
      limit: 14,
    });
    expect(out).toHaveLength(14);
    expect(out[9].id).toBe('x');
    expect(out.filter((d) => d.id === 'x')).toHaveLength(1);
  });

  it('never explores into a category the user already asked for, or repeats a pool row', () => {
    const deals = Array.from({ length: 20 }, (_, i) => offer(`p${i}`, { productName: `Μάρκα${i} Γάλα` }));
    const explore = [
      offer('same-cat', { category: 'Γαλακτοκομικά', productName: 'Άλλο Γάλα' }),
      offer('p3', { category: 'Κάβα', productName: 'Μάρκα3 Γάλα' }), // already in the pool
      offer('learned', { category: 'Κρέας', productName: 'Κάτι Κρέας' }),
    ];
    const out = rankPersonalFeed({
      deals,
      explore,
      profile: EMPTY_PROFILE,
      declaredCategories: ['Γαλακτοκομικά'],
      learnedCategories: ['Κρέας'],
      preferredStores: ['ab'],
      limit: 14,
    });
    expect(out.map((d) => d.id)).not.toContain('same-cat');
    expect(out.map((d) => d.id)).not.toContain('learned');
    expect(out.filter((d) => d.id === 'p3')).toHaveLength(1);
  });

  it('falls back to a pure personal rail when nothing qualifies as exploration', () => {
    const deals = Array.from({ length: 14 }, (_, i) => offer(`p${i}`, { productName: `Μάρκα${i} Γάλα` }));
    const out = rankPersonalFeed({ deals, explore: [], profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'], limit: 14 });
    expect(out).toHaveLength(14);
  });

  // hotScore is lumpy by chain: with no stores ticked the live rail came back
  // 13/14 Μασούτης (measured 2026-09-16). A chain the user did not pick gets
  // at most CHAIN_CAP cards; their own chains are never capped.
  it('caps a chain the user did not tick at three cards', () => {
    const deals = Array.from({ length: 10 }, (_, i) => offer(`m${i}`, { supermarket: 'masoutis', productName: `Μάρκα${i} Γάλα` }));
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'], limit: 14 });
    expect(out).toHaveLength(CHAIN_CAP);
  });

  it('never caps the user own chains', () => {
    const deals = Array.from({ length: 10 }, (_, i) => offer(`a${i}`, { supermarket: 'ab', productName: `Μάρκα${i} Γάλα` }));
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'], limit: 14 });
    expect(out).toHaveLength(10);
  });

  it('reserved slots: two of each per twenty, never colliding, never position 0', () => {
    expect(exploreSlots(20)).toEqual([9, 19]);
    expect(exploreSlots(14)).toEqual([9]);
    expect(exploreSlots(1)).toEqual([]);
    expect(savingSlots(20)).toEqual([4, 14]);
    expect(savingSlots(14)).toEqual([4]);
    expect(savingSlots(20).filter((i) => exploreSlots(20).includes(i))).toEqual([]);
  });
});

// The reason stores stopped being a filter: a chain the user did not tick can
// hold the cheapest price of the cluster. One slot per ten is reserved for it.
describe('rankPersonalFeed — cheaper-elsewhere slot', () => {
  const pool = (n: number) => Array.from({ length: n }, (_, i) => offer(`p${i}`, { productName: `Μάρκα${i} Γάλα` }));

  it('reserves slot 5 for a cheapest-in-cluster row from a chain the user did not tick', () => {
    const deals = [
      ...pool(14),
      offer('saver', { supermarket: 'masoutis', productName: 'Παλμολίβ Πιάτων', isCheapestInCluster: true }),
    ];
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'], limit: 14 });
    expect(out[4].id).toBe('saver');
    expect(out.filter((d) => d.id === 'saver')).toHaveLength(1);
  });

  it('does not reserve anything when the user has no preferred stores', () => {
    const deals = [
      ...pool(14),
      offer('saver', { supermarket: 'masoutis', productName: 'Παλμολίβ Πιάτων', isCheapestInCluster: true }),
    ];
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: [], limit: 14 });
    expect(out.findIndex((d) => d.id === 'saver')).not.toBe(4);
  });

  it('never treats the user own chain as a cheaper elsewhere', () => {
    const deals = [
      ...pool(14),
      offer('mine', { supermarket: 'ab', productName: 'Παλμολίβ Πιάτων', isCheapestInCluster: true }),
    ];
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'], limit: 14 });
    expect(out[4].id).not.toBe('mine');
    expect(out[0].id).toBe('mine'); // it still wins on score: preferred + cheapest
  });

  it('keeps the rail full when a saving row is the only thing left', () => {
    const deals = [
      offer('a', { supermarket: 'ab', productName: 'Άλφα Γάλα' }),
      offer('saver', { supermarket: 'lidl', productName: 'Βήτα Γάλα', isCheapestInCluster: true }),
    ];
    const out = rankPersonalFeed({ deals, profile: EMPTY_PROFILE, declaredCategories: [], preferredStores: ['ab'], limit: 14 });
    expect(out.map((d) => d.id).sort()).toEqual(['a', 'saver']);
  });
});
