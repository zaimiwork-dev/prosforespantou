import { describe, it, expect } from 'vitest';
import { computeHotScore, CHEAPEST_BOOST } from './hotness';

describe('computeHotScore — cheapest in cluster', () => {
  const base = {
    productName: 'ΔΕΛΤΑ Γάλα Πλήρες 1lt',
    category: 'Γαλακτοκομικά & Είδη Ψυγείου',
    jitterKey: 'same-row',
  };

  it(`adds exactly CHEAPEST_BOOST (${CHEAPEST_BOOST}) when the offer is the cheapest row`, () => {
    const plain = computeHotScore(base);
    const cheapest = computeHotScore({ ...base, cheapestInCluster: true });
    expect(Math.round((cheapest - plain) * 100) / 100).toBe(CHEAPEST_BOOST);
  });

  it('false or missing adds nothing (per-write scores stay as before)', () => {
    expect(computeHotScore({ ...base, cheapestInCluster: false })).toBe(computeHotScore(base));
    expect(computeHotScore({ ...base, cheapestInCluster: null })).toBe(computeHotScore(base));
  });
});
