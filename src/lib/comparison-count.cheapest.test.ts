import { describe, it, expect } from 'vitest';
import { comparisonRivals, comparisonChainCount, isCheapestInCluster } from './comparison-count';

const NOW = new Date('2026-09-16T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);
const FRESH = new Map([
  ['ab', daysAgo(1).toISOString()],
  ['kritikos', daysAgo(1).toISOString()],
]);
const NAME = 'ΗΒΗ Πορτοκαλάδα με ανθρακικό 1,5lt';
const source = { productName: NAME, supermarket: 'masoutis', discountedPrice: 1.49 };

describe('comparisonRivals', () => {
  it('returns the sheet’s other-chain rows with their prices, offers and shelf alike', () => {
    const rivals = comparisonRivals({
      source,
      clusterOffers: [
        { productName: NAME, supermarket: 'ab', discountedPrice: 1.59 },
        { productName: NAME, supermarket: 'masoutis', discountedPrice: 1.39 }, // own chain: not a rival
      ],
      barcodeBacked: true,
      snapshots: [{ supermarket: 'kritikos', price: 1.85, recordedAt: daysAgo(3) }],
      freshChains: FRESH,
      now: NOW,
    });
    expect(rivals).toEqual([
      { supermarket: 'ab', price: 1.59, rowType: 'offer' },
      { supermarket: 'kritikos', price: 1.85, rowType: 'shelf' },
    ]);
  });

  it('the chip count is derived from the same rows (lockstep)', () => {
    const args = {
      source,
      clusterOffers: [{ productName: NAME, supermarket: 'ab', discountedPrice: 1.59 }],
      barcodeBacked: true,
      snapshots: [{ supermarket: 'kritikos', price: 1.85, recordedAt: daysAgo(3) }],
      freshChains: FRESH,
      now: NOW,
    };
    expect(comparisonChainCount(args)).toBe(new Set(comparisonRivals(args).map((r) => r.supermarket)).size);
  });
});

describe('isCheapestInCluster', () => {
  it('true when no rival row is cheaper; a tie still counts', () => {
    expect(isCheapestInCluster(1.49, [
      { supermarket: 'ab', price: 1.59, rowType: 'offer' },
      { supermarket: 'kritikos', price: 1.49, rowType: 'shelf' },
    ])).toBe(true);
  });

  it('false when any rival is cheaper, including a plain shelf price', () => {
    expect(isCheapestInCluster(1.49, [
      { supermarket: 'ab', price: 1.59, rowType: 'offer' },
      { supermarket: 'kritikos', price: 1.45, rowType: 'shelf' },
    ])).toBe(false);
  });

  it('no rival → no claim', () => {
    expect(isCheapestInCluster(1.49, [])).toBe(false);
  });

  it('an unknown rival price blocks the claim; a missing source price never claims', () => {
    expect(isCheapestInCluster(1.49, [{ supermarket: 'ab', price: null, rowType: 'offer' }])).toBe(false);
    expect(isCheapestInCluster(null, [{ supermarket: 'ab', price: 2, rowType: 'offer' }])).toBe(false);
  });
});
