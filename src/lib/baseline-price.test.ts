import { describe, it, expect } from 'vitest';
import { computeBaseline, shelfPriceFor, isMonoOffer, BASELINE_MAX_RATIO } from './baseline-price';

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
