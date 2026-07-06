import { describe, it, expect } from 'vitest';
import { pickShelfRows, SHELF_PRICE_MAX_AGE_DAYS } from './shelf-comparison';

const NOW = new Date('2026-07-06T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('pickShelfRows', () => {
  it('keeps only the latest snapshot per chain, sorted by price', () => {
    const rows = pickShelfRows({
      snapshots: [
        { supermarket: 'ab', price: 2.5, recordedAt: daysAgo(6) },
        { supermarket: 'ab', price: 2.1, recordedAt: daysAgo(1) },
        { supermarket: 'kritikos', price: 1.9, recordedAt: daysAgo(3) },
      ],
      excludedChains: [],
      now: NOW,
    });
    expect(rows.map((r) => [r.supermarket, r.price])).toEqual([
      ['kritikos', 1.9],
      ['ab', 2.1],
    ]);
    expect(rows[0].rowType).toBe('shelf');
    expect(rows[0].id).toBe('shelf:kritikos');
  });

  it('drops snapshots older than the freshness cutoff', () => {
    const rows = pickShelfRows({
      snapshots: [
        { supermarket: 'ab', price: 2.0, recordedAt: daysAgo(SHELF_PRICE_MAX_AGE_DAYS + 1) },
        { supermarket: 'kritikos', price: 1.5, recordedAt: daysAgo(2) },
      ],
      excludedChains: [],
      now: NOW,
    });
    expect(rows.map((r) => r.supermarket)).toEqual(['kritikos']);
  });

  it('a stale-latest does not fall back to an older in-window snapshot of the same chain', () => {
    // If the chain's newest record is fresh it wins; ordering of input must not matter.
    const rows = pickShelfRows({
      snapshots: [
        { supermarket: 'ab', price: 2.4, recordedAt: daysAgo(13) },
        { supermarket: 'ab', price: 2.2, recordedAt: daysAgo(4) },
      ],
      excludedChains: [],
      now: NOW,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(2.2);
  });

  it('excludes chains that already appear as offers (or are the source chain)', () => {
    const rows = pickShelfRows({
      snapshots: [
        { supermarket: 'masoutis', price: 1.0, recordedAt: daysAgo(1) },
        { supermarket: 'lidl', price: 1.2, recordedAt: daysAgo(1) },
      ],
      excludedChains: ['masoutis'],
      now: NOW,
    });
    expect(rows.map((r) => r.supermarket)).toEqual(['lidl']);
  });

  it('rejects junk: null chain, non-positive or non-finite price, future timestamps', () => {
    const rows = pickShelfRows({
      snapshots: [
        { supermarket: null, price: 1.0, recordedAt: daysAgo(1) },
        { supermarket: 'ab', price: 0, recordedAt: daysAgo(1) },
        { supermarket: 'ab', price: NaN, recordedAt: daysAgo(1) },
        { supermarket: 'ab', price: 2.0, recordedAt: new Date(NOW.getTime() + 3600_000).toISOString() },
      ],
      excludedChains: [],
      now: NOW,
    });
    expect(rows).toEqual([]);
  });

  it('returns ISO recordedAt for serialization across the server-action boundary', () => {
    const rows = pickShelfRows({
      snapshots: [{ supermarket: 'ab', price: 2.0, recordedAt: daysAgo(1) }],
      excludedChains: [],
      now: NOW,
    });
    expect(rows[0].recordedAt).toBe(daysAgo(1));
  });
});
