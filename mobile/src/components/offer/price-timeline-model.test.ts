import { describe, expect, it } from 'vitest';
import type { PriceTimeline } from '@/lib/api';
import {
  chartLabel,
  domainFor,
  factsFor,
  formatDay,
  formatMonthFrom,
  pickAt,
  viewKind,
  visiblePromos,
  visibleShelf,
  xOf,
  yScaleFor,
} from './price-timeline-model';

const NOW = new Date('2026-11-12T12:00:00Z').getTime();
const DAY = 86400000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const fmt = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

function tl(over: Partial<PriceTimeline> = {}, stats: Partial<PriceTimeline['stats']> = {}): PriceTimeline {
  return {
    since: iso(120),
    daysTracked: 120,
    shelf: [
      { from: iso(120), to: iso(60), price: 2 },
      { from: iso(60), to: iso(0), price: 2.2 },
    ],
    promos: [{ at: iso(20), until: null, price: 1.6, kind: 'mono', ongoing: false }],
    stats: {
      shelfNow: 2.2, shelfFirst: 2, shelfChangePct: 10, shelfChanges: 1, lowest: { price: 1.6, at: iso(20) },
      highest: { price: 2.2, at: iso(60) }, promoCount: 1, currentPrice: 1.6, currentIsLowest: false, suspect: false, ...stats,
    },
    quality: 'ok',
    reliable: true,
    ...over,
  };
}

describe('viewKind', () => {
  it('maps the four cases', () => {
    expect(viewKind(undefined)).toBe('none');
    expect(viewKind(tl({ quality: 'none' }))).toBe('none');
    expect(viewKind(tl({ quality: 'thin' }))).toBe('thin');
    expect(viewKind(tl({ reliable: false }))).toBe('unreliable');
    expect(viewKind(tl())).toBe('chart');
  });
});

describe('dates', () => {
  it('prints Greek short days and months, with the year only when it differs', () => {
    expect(formatDay(iso(0), NOW)).toBe('12 Νοε');
    expect(formatDay('2025-03-05T12:00:00Z', NOW)).toBe('5 Μαρ 2025');
    expect(formatMonthFrom('2026-10-03T12:00:00Z', NOW)).toBe('Οκτώβριο');
    expect(formatMonthFrom('2025-10-03T12:00:00Z', NOW)).toBe('Οκτώβριο 2025');
  });
});

describe('ranges', () => {
  it('starts at since for Όλα and never before since for a long range', () => {
    const t = tl({ since: iso(40) });
    expect(domainFor(t, 'ALL', NOW).t0).toBe(NOW - 40 * DAY);
    expect(domainFor(t, '6M', NOW).t0).toBe(NOW - 40 * DAY);
    expect(domainFor(t, '1M', NOW).t0).toBe(NOW - 30 * DAY);
  });
  it('clips shelf steps and drops what is outside', () => {
    const t = tl();
    const d = domainFor(t, '1M', NOW);
    const s = visibleShelf(t, d);
    expect(s).toHaveLength(1);
    expect(s[0].price).toBe(2.2);
    expect(s[0].from).toBe(d.t0);
  });
  it('keeps promos in range; draws a segment only when closed or ongoing', () => {
    const t = tl({
      promos: [
        { at: iso(100), until: null, price: 1.5, kind: 'mono', ongoing: false },
        { at: iso(20), until: iso(10), price: 1.6, kind: 'mono', ongoing: false },
        { at: iso(3), until: null, price: 1.7, kind: 'mono', ongoing: true },
      ],
    });
    const p = visiblePromos(t, domainFor(t, '3M', NOW));
    expect(p.map((x) => x.price)).toEqual([1.6, 1.7]);
    expect(p[0].until).toBe(NOW - 10 * DAY);
    expect(p[1].until).toBe(NOW);
    const all = visiblePromos(t, domainFor(t, 'ALL', NOW));
    expect(all[0].until).toBeNull();
  });
});

describe('scales', () => {
  it('gives 3 gridlines for a spread, 1 for a flat series', () => {
    const s = yScaleFor([2, 2.2, 1.6]);
    expect(s.ticks).toEqual([1.6, 1.9, 2.2]);
    expect(s.lo).toBeLessThan(1.6);
    expect(s.hi).toBeGreaterThan(2.2);
    expect(yScaleFor([3, 3]).ticks).toEqual([3]);
  });
  it('maps time to x', () => {
    const d = { t0: 0, t1: 100 };
    expect(xOf(50, d, 10, 200)).toBe(110);
  });
});

describe('pickAt', () => {
  const shelf = [{ from: 0, to: 100, price: 2 }, { from: 100, to: 200, price: 2.5 }];
  const promos = [{ at: 150, until: null, price: 1.8 }];
  it('prefers a promo dot within the finger slop', () => {
    expect(pickAt(145, shelf, promos, 10)).toEqual({ at: 150, price: 1.8, kind: 'promo' });
  });
  it('otherwise the shelf price in force', () => {
    expect(pickAt(50, shelf, promos, 10)).toEqual({ at: 50, price: 2, kind: 'shelf' });
  });
  it('falls back to the nearest promo when no shelf covers the time', () => {
    expect(pickAt(300, [], promos, 10)?.kind).toBe('promo');
    expect(pickAt(300, [], [], 10)).toBeNull();
  });
});

describe('factsFor', () => {
  it('says only what is true', () => {
    const f = factsFor(tl(), fmt, NOW).map((x) => x.id);
    expect(f).toEqual(['change', 'lowest', 'shelfNow']);
  });
  it('shows the green pill and does not repeat the lowest', () => {
    const f = factsFor(tl({}, { currentIsLowest: true }), fmt, NOW);
    expect(f[0]).toMatchObject({ id: 'lowestNow', good: true });
    expect(f[0].text).toBe('Η χαμηλότερη τιμή από Ιούλιο');
    expect(f.map((x) => x.id)).not.toContain('lowest');
  });
  it('skips a change under 1% and a single promo; caps at three', () => {
    const f = factsFor(tl({}, { shelfChangePct: 0.4, promoCount: 1 }), fmt, NOW).map((x) => x.id);
    expect(f).toEqual(['lowest', 'shelfNow']);
    expect(factsFor(tl({}, { promoCount: 5, currentIsLowest: true }), fmt, NOW)).toHaveLength(3);
  });
  it('words a fall and uses the server percentage', () => {
    const f = factsFor(tl({}, { shelfChangePct: -12.4 }), fmt, NOW);
    expect(f.find((x) => x.id === 'change')?.text).toBe('Η κανονική τιμή έπεσε 12% από Ιούλιο');
  });
  it('builds the screen-reader sentence', () => {
    expect(chartLabel(tl(), fmt, NOW)).toContain('Κανονική τιμή: 2,20 €.');
  });
});

describe('factsFor dates each fact from its own first observation', () => {
  it('the shelf change is dated from the first SHELF step, not from an older promo', () => {
    // Promos seen 200 days ago; the shelf price only read for the last 12 days.
    const t = tl({
      since: iso(200),
      shelf: [
        { from: iso(12), to: iso(5), price: 4.84 },
        { from: iso(5), to: iso(0), price: 5.07 },
      ],
      promos: [
        { at: iso(200), until: null, price: 5.07, kind: 'legacy', ongoing: false },
        { at: iso(130), until: null, price: 4.21, kind: 'mono', ongoing: false },
      ],
    }, { shelfChangePct: 4.8, promoCount: 2 });
    const facts = factsFor(t, fmt, NOW);
    const month = (daysAgo: number) => factsFor(tl({ since: iso(daysAgo) }, { currentIsLowest: true }), fmt, NOW)[0].text.replace('Η χαμηλότερη τιμή από ', '');
    expect(facts.find((x) => x.id === 'change')?.text).toBe(`Η κανονική τιμή ανέβηκε 5% από ${month(12)}`);
    expect(month(12)).not.toBe(month(200));
  });

  it('says nothing about a shelf change when no shelf step exists', () => {
    const t = tl({ shelf: [] }, { shelfChangePct: 4.8 });
    expect(factsFor(t, fmt, NOW).map((x) => x.id)).not.toContain('change');
  });
});
