import { describe, expect, it } from 'vitest';
import type { PriceTimeline } from './price-timeline';
import { headlineFor, offerBands, usualLineFor, visiblePromos, domainFor, thinLine, viewKind, shelfPath } from './price-history-view';

const NOW = new Date('2026-11-22T12:00:00Z').getTime();
const DAY = 86400000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const fmt = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

function tl(over: Partial<PriceTimeline> = {}, stats: Partial<PriceTimeline['stats']> = {}): PriceTimeline {
  return {
    since: iso(80),
    daysTracked: 80,
    shelf: [
      { from: iso(80), to: iso(40), price: 2.57 },
      { from: iso(40), to: iso(0), price: 2.57 },
    ],
    promos: [
      { at: iso(70), until: iso(60), price: 1.53, kind: 'mono', ongoing: false },
      { at: iso(30), until: null, price: 1.93, kind: 'mono', ongoing: false },
      { at: iso(5), until: iso(0), price: 1.93, kind: 'mono', ongoing: true },
    ],
    stats: {
      shelfNow: 2.57, shelfUsual: 2.57, shelfFirst: 2.57, shelfChangePct: null, shelfChanges: 0,
      lowest: { price: 1.53, at: iso(70) }, highest: { price: 2.57, at: iso(80) },
      promoCount: 3, currentPrice: 1.93, currentIsLowest: false, suspect: false, ...stats,
    },
    quality: 'ok',
    reliable: true,
    ...over,
  };
}

describe('headlineFor — the lead sentence', () => {
  it('says what it usually costs, how often it is on offer, and the lowest', () => {
    expect(headlineFor(tl(), fmt, NOW)).toEqual({
      pill: null,
      sentence: 'Συνήθως 2,57 €. Σε προσφορά 3 φορές από τον Σεπτέμβριο, με χαμηλότερη τιμή 1,53 €.',
    });
  });

  it('puts «lowest» in the pill and does not repeat it', () => {
    const h = headlineFor(tl({}, { currentIsLowest: true, currentPrice: 1.53 }), fmt, NOW);
    expect(h.pill).toBe('Η χαμηλότερη τιμή από τον Σεπτέμβριο');
    expect(h.sentence).toBe('Συνήθως 2,57 €. Σε προσφορά 3 φορές από τον Σεπτέμβριο.');
  });

  it('with fewer than two offers, says how the regular price moved', () => {
    const h = headlineFor(tl({ promos: [] }, { promoCount: 0, shelfChangePct: -12.4, shelfChanges: 1 }), fmt, NOW);
    expect(h.sentence).toBe('Συνήθως 2,57 €. Η κανονική τιμή έπεσε 12% από τον Σεπτέμβριο.');
  });

  it('says a steady price is steady, but only after two weeks of watching', () => {
    const steady = tl({ promos: [], shelf: [{ from: iso(30), to: iso(0), price: 2.57 }] }, { promoCount: 0, lowest: null });
    expect(headlineFor(steady, fmt, NOW).sentence).toBe('Συνήθως 2,57 €. Η κανονική τιμή δεν έχει αλλάξει από τον Οκτώβριο.');
    const fresh = tl({ promos: [], shelf: [{ from: iso(5), to: iso(0), price: 2.57 }] }, { promoCount: 0, lowest: null });
    expect(headlineFor(fresh, fmt, NOW).sentence).toBe('Συνήθως 2,57 €.');
  });

  it('uses the year when the month is from last year', () => {
    const old = tl({ since: '2025-10-03T12:00:00Z', promos: [{ at: '2025-10-03T12:00:00Z', until: null, price: 1.5, kind: 'mono', ongoing: false }, { at: iso(3), until: null, price: 1.9, kind: 'mono', ongoing: false }] });
    expect(headlineFor(old, fmt, NOW).sentence).toContain('από τον Οκτώβριο 2025');
  });

  it('falls back to the latest shelf step when the usual price is unknown', () => {
    expect(headlineFor(tl({}, { shelfUsual: null, shelfNow: 2.6 }), fmt, NOW).sentence).toMatch(/^Συνήθως 2,60 €\./);
  });
});

describe('offerBands — shade only what the data knows', () => {
  it('shades closed and running offers, never an offer with an unknown end', () => {
    const d = domainFor(tl(), 'ALL', NOW);
    const bands = offerBands(visiblePromos(tl(), d));
    expect(bands).toEqual([
      { from: NOW - 70 * DAY, to: NOW - 60 * DAY },
      { from: NOW - 5 * DAY, to: NOW },
    ]);
  });
});

describe('usualLineFor', () => {
  it('draws the usual price when the shelf moved around it', () => {
    const t = tl({ shelf: [{ from: iso(80), to: iso(40), price: 2.2 }, { from: iso(40), to: iso(0), price: 2.57 }] }, { shelfNow: 2.57, shelfUsual: 2.2 });
    expect(usualLineFor(t)).toBe(2.2);
  });

  it('skips it when one flat step already says it', () => {
    expect(usualLineFor(tl({ shelf: [{ from: iso(80), to: iso(0), price: 2.57 }] }))).toBeNull();
    expect(usualLineFor(tl({}, { shelfUsual: null }))).toBeNull();
  });
});

describe('a few days of data is not a history', () => {
  it('shows the «tracking since» line, not a chart, under a week', () => {
    expect(viewKind(tl({ since: iso(0.4) }), NOW)).toBe('thin');
    expect(viewKind(tl({ since: iso(8) }), NOW)).toBe('chart');
    expect(viewKind(tl({ since: iso(0.4), reliable: false }), NOW)).toBe('unreliable');
  });

  it('does not claim «lowest since …» on less than four weeks', () => {
    const recent = tl({ since: iso(10) }, { currentIsLowest: true, currentPrice: 1.53 });
    expect(headlineFor(recent, fmt, NOW).pill).toBeNull();
  });
});

describe('shelfPath', () => {
  it('widens a step read for seconds so it stays visible', () => {
    const d = shelfPath([{ from: 100, to: 100, price: 2 }], (t) => t, () => 50, 4);
    expect(d).toBe('M 100.0 50.0 L 104.0 50.0');
  });
});

describe('thinLine', () => {
  it('names the day tracking started', () => {
    expect(thinLine(tl({ since: iso(3) }), NOW)).toBe('Παρακολουθούμε αυτή την τιμή από τις 19 Νοε.');
  });
});
