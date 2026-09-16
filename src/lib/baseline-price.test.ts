import { describe, it, expect } from 'vitest';
import { computeBaseline, shelfPriceFor, isMonoOffer, baselineForCard, BASELINE_MAX_RATIO } from './baseline-price';

const now = new Date('2026-09-16T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const fresh = new Map([['ab', daysAgo(1)], ['lidl', daysAgo(2)]]);

describe('isMonoOffer', () => {
  it('trusts offerType, falls back to «no printed original price»', () => {
    expect(isMonoOffer({ offerType: 'mono', originalPrice: 3 })).toBe(true);
    expect(isMonoOffer({ offerType: 'strikethrough', originalPrice: null })).toBe(false);
    expect(isMonoOffer({ offerType: null, originalPrice: null })).toBe(true);
    expect(isMonoOffer({ offerType: null, originalPrice: 2.5 })).toBe(false);
  });
});

describe('shelfPriceFor', () => {
  it('takes the LATEST shelf price of the offer’s own chain, dated by the feed run', () => {
    const snaps = [
      { supermarket: 'ab', price: 5.56, recordedAt: daysAgo(80) },
      { supermarket: 'ab', price: 6.95, recordedAt: daysAgo(40) }, // price rose; a median would lag
      { supermarket: 'lidl', price: 4.99, recordedAt: daysAgo(3) },
    ];
    expect(shelfPriceFor({ supermarket: 'ab', normalSnapshots: snaps, freshChains: fresh, now }))
      .toEqual({ price: 6.95, checkedAt: daysAgo(1) });
  });

  it('keeps a stable price older than 90 days (snapshots are written only on change)', () => {
    const snaps = [{ supermarket: 'ab', price: 2.1, recordedAt: daysAgo(150) }];
    expect(shelfPriceFor({ supermarket: 'ab', normalSnapshots: snaps, freshChains: fresh, now })?.price).toBe(2.1);
  });

  it('returns null when the chain’s feed is not alive, or the chain is unknown', () => {
    const snaps = [{ supermarket: 'masoutis', price: 2.1, recordedAt: daysAgo(5) }];
    expect(shelfPriceFor({ supermarket: 'masoutis', normalSnapshots: snaps, freshChains: fresh, now })).toBeNull();
    expect(shelfPriceFor({ supermarket: null, normalSnapshots: snaps, freshChains: fresh, now })).toBeNull();
  });
});

describe('computeBaseline', () => {
  const snaps = [{ supermarket: 'ab', price: 2.0, recordedAt: daysAgo(20) }];

  it('ΜΟΝΟ offer below shelf → baseline, feed date, implied %', () => {
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 1.5, offerType: 'mono', normalSnapshots: snaps, freshChains: fresh, now }))
      .toEqual({ baselinePrice: 2.0, baselineAt: new Date(daysAgo(1)), impliedPercent: 25 });
  });

  it('keeps zero/negative implied % (the offer is not below shelf) so the UI can stay silent', () => {
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 2.2, offerType: 'mono', normalSnapshots: snaps, freshChains: fresh, now })?.impliedPercent).toBe(-10);
  });

  it('never for a chain-published strikethrough offer', () => {
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 1.5, offerType: 'strikethrough', originalPrice: 2.2, normalSnapshots: snaps, freshChains: fresh, now })).toBeNull();
  });

  it(`drops a shelf price over ${BASELINE_MAX_RATIO}× the offer (different pack, not a saving)`, () => {
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 0.6, offerType: 'mono', normalSnapshots: snaps, freshChains: fresh, now })).toBeNull();
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 0.67, offerType: 'mono', normalSnapshots: snaps, freshChains: fresh, now })?.impliedPercent).toBe(67);
  });

  it('refuses a missing or non-positive offer price', () => {
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 0, offerType: 'mono', normalSnapshots: snaps, freshChains: fresh, now })).toBeNull();
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: null, offerType: 'mono', normalSnapshots: snaps, freshChains: fresh, now })).toBeNull();
  });
});

describe('baselineForCard', () => {
  const base = { baselinePrice: 2.45, impliedPercent: 25, baselineAt: '2026-09-13T00:00:00Z' };

  it('shows a baseline that is comfortably below shelf', () => {
    expect(baselineForCard(base)).toEqual({ price: 2.45, percent: 25, checkedAt: new Date('2026-09-13T00:00:00Z') });
  });

  it('stays silent under the threshold, at shelf price, or above it', () => {
    expect(baselineForCard({ ...base, impliedPercent: 9 })).toBeNull();
    expect(baselineForCard({ ...base, impliedPercent: 0 })).toBeNull();
    expect(baselineForCard({ ...base, impliedPercent: -10 })).toBeNull();
  });

  it('never competes with a chain-published «was» price', () => {
    expect(baselineForCard({ ...base, originalPrice: 3.2 })).toBeNull();
  });

  it('handles snake_case rows and missing data', () => {
    expect(baselineForCard({ baseline_price: 2, implied_percent: 20, baseline_at: null })).toEqual({ price: 2, percent: 20, checkedAt: null });
    expect(baselineForCard(null)).toBeNull();
    expect(baselineForCard({ baselinePrice: null, impliedPercent: 30 })).toBeNull();
  });

  it('takes a caller threshold', () => {
    expect(baselineForCard({ ...base, impliedPercent: 6 }, 5)?.percent).toBe(6);
  });
});

describe('standing-price guard', () => {
  const snaps = [{ supermarket: 'ab', price: 5.6, recordedAt: daysAgo(90) }];

  it('drops the baseline when the chain charged about this price months ago', () => {
    const mono = [{ supermarket: 'ab', price: 2.8, recordedAt: daysAgo(84) }];
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 2.82, offerType: 'mono', normalSnapshots: snaps, monoSnapshots: mono, freshChains: fresh, now })).toBeNull();
  });

  it('keeps it when the low price is recent (a real promotion)', () => {
    const mono = [{ supermarket: 'ab', price: 2.8, recordedAt: daysAgo(10) }];
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 2.82, offerType: 'mono', normalSnapshots: snaps, monoSnapshots: mono, freshChains: fresh, now })?.baselinePrice).toBe(5.6);
  });

  it('ignores an old mono price that was much higher, and other chains', () => {
    const higher = [{ supermarket: 'ab', price: 5.2, recordedAt: daysAgo(84) }];
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 2.82, offerType: 'mono', normalSnapshots: snaps, monoSnapshots: higher, freshChains: fresh, now })?.baselinePrice).toBe(5.6);
    const otherChain = [{ supermarket: 'lidl', price: 2.8, recordedAt: daysAgo(84) }];
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 2.82, offerType: 'mono', normalSnapshots: snaps, monoSnapshots: otherChain, freshChains: fresh, now })?.baselinePrice).toBe(5.6);
  });
});

describe('shelf overtaken by the chain’s own older ΜΟΝΟ prices', () => {
  // Kritikos Softex Silk 8T, measured 2026-09-16.
  const shelf = [{ supermarket: 'ab', price: 8.5, recordedAt: daysAgo(95) }];
  const mono = [{ supermarket: 'ab', price: 4.68, recordedAt: daysAgo(89) }];

  it('drops a shelf figure the shop itself stopped charging months ago', () => {
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 3.83, offerType: 'mono', normalSnapshots: shelf, monoSnapshots: mono, freshChains: fresh, now })).toBeNull();
  });

  it('keeps it when older ΜΟΝΟ prices sat close to the shelf figure', () => {
    const near = [{ supermarket: 'ab', price: 7.9, recordedAt: daysAgo(89) }];
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 3.83, offerType: 'mono', normalSnapshots: shelf, monoSnapshots: near, freshChains: fresh, now })?.baselinePrice).toBe(8.5);
  });

  it('ignores a recent undercut — that is the promotion itself', () => {
    const recent = [{ supermarket: 'ab', price: 4.68, recordedAt: daysAgo(10) }];
    expect(computeBaseline({ supermarket: 'ab', discountedPrice: 3.83, offerType: 'mono', normalSnapshots: shelf, monoSnapshots: recent, freshChains: fresh, now })?.baselinePrice).toBe(8.5);
  });
});

describe('the card claim is capped', () => {
  it('suppresses implausibly deep savings (bad shelf reads, shared product records)', () => {
    expect(baselineForCard({ baselinePrice: 17.98, impliedPercent: 64 })).toBeNull();
    expect(baselineForCard({ baselinePrice: 4.98, impliedPercent: 50 })?.percent).toBe(50);
  });
});
