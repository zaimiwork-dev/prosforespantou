import { describe, expect, it } from 'vitest';
import { formatUpdatedAt, isFresh, parseEntry, pickEvictions } from './cache';

describe('isFresh', () => {
  it('is fresh inside the ttl and stale after', () => {
    expect(isFresh({ fetchedAt: 1000 }, 500, 1400)).toBe(true);
    expect(isFresh({ fetchedAt: 1000 }, 500, 1500)).toBe(false);
  });
  it('treats a missing entry or a clock that went backwards as not fresh', () => {
    expect(isFresh(undefined, 500, 1000)).toBe(false);
    expect(isFresh({ fetchedAt: 2000 }, 500, 1000)).toBe(false);
  });
});

describe('pickEvictions', () => {
  const rows = [
    { key: 'a', fetchedAt: 10 },
    { key: 'b', fetchedAt: 50 },
    { key: 'c', fetchedAt: 30 },
    { key: 'd', fetchedAt: 40 },
  ];
  it('drops nothing at or under the cap', () => {
    expect(pickEvictions(rows, 4)).toEqual([]);
  });
  it('drops the oldest first', () => {
    expect(pickEvictions(rows, 2)).toEqual(['c', 'a']);
  });
  it('does not mutate its input', () => {
    pickEvictions(rows, 1);
    expect(rows[0].key).toBe('a');
  });
});

describe('parseEntry', () => {
  it('reads a valid entry', () => {
    expect(parseEntry('{"data":{"x":1},"fetchedAt":5}')).toEqual({ data: { x: 1 }, fetchedAt: 5 });
  });
  it('ignores corrupt or malformed entries', () => {
    for (const raw of [null, '', '{oops', '[]', '{"data":1}', '{"fetchedAt":5}', '{"data":null,"fetchedAt":5}', '{"data":1,"fetchedAt":"x"}']) {
      expect(parseEntry(raw)).toBeNull();
    }
  });
});

describe('formatUpdatedAt', () => {
  it('shows the time today and the date for older', () => {
    const now = new Date(2026, 10, 11, 15, 0).getTime();
    expect(formatUpdatedAt(new Date(2026, 10, 11, 10, 32).getTime(), now)).toBe('10:32');
    expect(formatUpdatedAt(new Date(2026, 10, 5, 10, 32).getTime(), now)).not.toMatch(/:/);
  });
});
