import { describe, it, expect } from 'vitest';
import { buildPriceTimeline, selectTimelineSnapshots } from './price-timeline';

const row = (chainItemcode: string | null, price: number, kind: string | null = 'mono') =>
  ({ chainItemcode, price, kind, recordedAt: '2026-11-01T00:00:00Z' });

describe('selectTimelineSnapshots (per-SKU history)', () => {
  const rows = [row('A', 1.99), row('B', 7.49), row(null, 2.5), row('A', 2.19)];

  it('keeps only the offer SKU rows when the SKU is known, legacy rows dropped for shared products', () => {
    const r = selectTimelineSnapshots({ rows, offerItemcode: 'A', mappingCount: 23 });
    expect(r.perSku).toBe(true);
    expect(r.rows.map((x) => x.price)).toEqual([1.99, 2.19]);
  });

  it('keeps itemcode-less rows when the product has a single mapping at the chain', () => {
    const r = selectTimelineSnapshots({ rows, offerItemcode: 'A', mappingCount: 1 });
    expect(r.rows.map((x) => x.price)).toEqual([1.99, 2.5, 2.19]);
  });

  it('falls back to all rows when no snapshot carries the offer SKU', () => {
    const r = selectTimelineSnapshots({ rows, offerItemcode: 'Z', mappingCount: 5 });
    expect(r).toEqual({ rows, perSku: false });
  });

  it('falls back to all rows when the offer has no itemcode', () => {
    expect(selectTimelineSnapshots({ rows, offerItemcode: null, mappingCount: 5 }).perSku).toBe(false);
    expect(selectTimelineSnapshots({ rows, offerItemcode: undefined, mappingCount: 5 }).rows).toBe(rows);
  });
});

describe('lastSeenAt closes promos', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  it('a promo seen until day 4 ends on day 4; one without lastSeenAt stays open', () => {
    const t = buildPriceTimeline({
      now,
      offer: null,
      shelfFeedAliveAt: null,
      snapshots: [
        { price: 3.2, kind: 'normal', recordedAt: '2026-10-01T00:00:00Z' },
        { price: 2.49, kind: 'mono', recordedAt: '2026-10-10T00:00:00Z', lastSeenAt: '2026-10-14T06:00:00Z', chainItemcode: 'A' },
        { price: 2.59, kind: 'mono', recordedAt: '2026-10-20T00:00:00Z', lastSeenAt: null },
      ],
    });
    expect(t.promos[0].until).toBe('2026-10-14T06:00:00.000Z');
    expect(t.promos[1].until).toBeNull();
  });

  it('a lastSeenAt before the row is ignored; a future one is clamped to now', () => {
    const t = buildPriceTimeline({
      now,
      offer: null,
      shelfFeedAliveAt: null,
      snapshots: [
        { price: 2.49, kind: 'mono', recordedAt: '2026-10-10T00:00:00Z', lastSeenAt: '2026-10-01T00:00:00Z' },
        { price: 2.59, kind: 'mono', recordedAt: '2026-10-20T00:00:00Z', lastSeenAt: '2026-12-01T00:00:00Z' },
      ],
    });
    expect(t.promos[0].until).toBeNull();
    expect(t.promos[1].until).toBe(now.toISOString());
  });
});
