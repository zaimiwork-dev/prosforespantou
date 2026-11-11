import { describe, it, expect } from 'vitest';
import { buildPriceTimeline, SUSPECT_JUMP_RATIO, type TimelineInput } from './price-timeline';
import fixtures from './__fixtures__/price-timeline.json';

const now = new Date('2026-11-11T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const build = (i: Partial<TimelineInput>) =>
  buildPriceTimeline({ snapshots: [], offer: null, shelfFeedAliveAt: null, now, ...i });

describe('real exported cases (2026-11-11, full output)', () => {
  for (const f of fixtures as Array<{ label: string; now: string; input: TimelineInput; expected: unknown }>) {
    it(f.label, () => {
      expect(buildPriceTimeline({ ...f.input, now: new Date(f.now) })).toEqual(f.expected);
    });
  }
});

describe('shelf steps', () => {
  it('come only from `normal` snapshots, sorted, each holding until the next', () => {
    const t = build({
      snapshots: [
        { price: 2.5, kind: 'normal', recordedAt: daysAgo(10) }, // out of order on purpose
        { price: 2.0, kind: 'normal', recordedAt: daysAgo(40) },
        { price: 1.5, kind: 'mono', recordedAt: daysAgo(20) }, // never a shelf step
      ],
    });
    expect(t.shelf).toEqual([
      { from: daysAgo(40), to: daysAgo(10), price: 2.0 },
      { from: daysAgo(10), to: daysAgo(10), price: 2.5 },
    ]);
  });

  it('holds the last step until the catalogue was last read when the feed is alive', () => {
    const t = build({
      snapshots: [{ price: 2, kind: 'normal', recordedAt: daysAgo(30) }],
      shelfFeedAliveAt: daysAgo(3),
    });
    expect(t.shelf).toEqual([{ from: daysAgo(30), to: daysAgo(3), price: 2 }]);
  });

  it('ends the last step at its own timestamp when the feed is dead or unknown', () => {
    const snapshots = [{ price: 2, kind: 'normal', recordedAt: daysAgo(30) }];
    expect(build({ snapshots, shelfFeedAliveAt: null }).shelf[0].to).toBe(daysAgo(30));
    // a feed whose last good run predates the snapshot proves nothing newer
    expect(build({ snapshots, shelfFeedAliveAt: daysAgo(40) }).shelf[0].to).toBe(daysAgo(30));
  });

  it('never stretches a step into the future', () => {
    const t = build({
      snapshots: [{ price: 2, kind: 'normal', recordedAt: daysAgo(3) }],
      shelfFeedAliveAt: new Date(now.getTime() + 86400000),
    });
    expect(t.shelf[0].to).toBe(now.toISOString());
  });

  it('merges consecutive equal prices into one step', () => {
    const t = build({
      snapshots: [
        { price: 2, kind: 'normal', recordedAt: daysAgo(30) },
        { price: 2, kind: 'normal', recordedAt: daysAgo(20) },
        { price: 3, kind: 'normal', recordedAt: daysAgo(10) },
      ],
    });
    expect(t.shelf).toEqual([
      { from: daysAgo(30), to: daysAgo(10), price: 2 },
      { from: daysAgo(10), to: daysAgo(10), price: 3 },
    ]);
  });

  it('ignores unusable rows (bad price, bad date)', () => {
    const t = build({
      snapshots: [
        { price: 0, kind: 'normal', recordedAt: daysAgo(5) },
        { price: Number.NaN, kind: 'mono', recordedAt: daysAgo(5) },
        { price: 2, kind: 'normal', recordedAt: 'not a date' },
      ],
    });
    expect(t.quality).toBe('none');
    expect(t.shelf).toEqual([]);
  });
});

describe('promos', () => {
  it('are every non-normal snapshot; a null kind is legacy; the end is unknown', () => {
    const t = build({
      snapshots: [
        { price: 1.0, kind: null, recordedAt: daysAgo(100) },
        { price: 1.1, kind: 'mono', recordedAt: daysAgo(50) },
        { price: 1.2, kind: 'strikethrough', recordedAt: daysAgo(20) },
        { price: 1.3, kind: 'something-new', recordedAt: daysAgo(10) },
      ],
    });
    expect(t.promos.map((p) => [p.kind, p.until, p.ongoing])).toEqual([
      ['legacy', null, false], // never extended to the next snapshot
      ['mono', null, false],
      ['strikethrough', null, false],
      ['legacy', null, false], // unknown kind = offer of unknown type
    ]);
  });

  it('uses lastSeenAt as the end when the row has one', () => {
    const t = build({ snapshots: [{ price: 1, kind: 'mono', recordedAt: daysAgo(20), lastSeenAt: daysAgo(14) }] });
    expect(t.promos[0].until).toBe(daysAgo(14));
  });

  it('ignores a lastSeenAt that precedes the row itself', () => {
    const t = build({ snapshots: [{ price: 1, kind: 'mono', recordedAt: daysAgo(20), lastSeenAt: daysAgo(30) }] });
    expect(t.promos[0].until).toBeNull();
  });

  it('marks the newest promo at the on-screen price ongoing, until now', () => {
    const t = build({
      snapshots: [
        { price: 1.5, kind: 'mono', recordedAt: daysAgo(60) },
        { price: 1.9, kind: 'mono', recordedAt: daysAgo(40) },
        { price: 1.5, kind: 'mono', recordedAt: daysAgo(5) },
      ],
      offer: { price: 1.5, firstSeenAt: daysAgo(5), active: true },
    });
    expect(t.promos.map((p) => p.ongoing)).toEqual([false, false, true]);
    expect(t.promos[2].until).toBe(now.toISOString());
    expect(t.promos[0].until).toBeNull();
  });

  it('synthesises an ongoing promo when no snapshot carries the offer price', () => {
    const t = build({
      snapshots: [{ price: 3, kind: 'normal', recordedAt: daysAgo(30) }],
      offer: { price: 3, firstSeenAt: daysAgo(4), active: true },
    });
    expect(t.promos).toEqual([{ at: daysAgo(4), until: now.toISOString(), price: 3, kind: 'legacy', ongoing: true }]);
    expect(t.stats.currentPrice).toBe(3);
  });

  it('draws nothing ongoing for an offer that is not active', () => {
    const t = build({
      snapshots: [{ price: 1.5, kind: 'mono', recordedAt: daysAgo(5) }],
      offer: { price: 1.5, firstSeenAt: daysAgo(5), active: false },
    });
    expect(t.promos[0].ongoing).toBe(false);
    expect(t.promos[0].until).toBeNull();
  });
});

describe('suspect jumps', () => {
  const jump = [
    { price: 10, kind: 'mono', recordedAt: daysAgo(80) }, // a promo on the old pack
    { price: 1, kind: 'normal', recordedAt: daysAgo(90) },
    { price: 5, kind: 'normal', recordedAt: daysAgo(70) }, // x5: a pack change
    { price: 4.5, kind: 'normal', recordedAt: daysAgo(30) },
  ];

  it('keeps the steps but flags suspect and withholds the % change', () => {
    const t = build({ snapshots: jump });
    expect(t.shelf.map((s) => s.price)).toEqual([1, 5, 4.5]);
    expect(t.stats.suspect).toBe(true);
    expect(t.stats.shelfChangePct).toBeNull();
    expect(t.stats.shelfChanges).toBe(2);
  });

  it('excludes everything before the last jump from lowest/highest (the old pack)', () => {
    const t = build({ snapshots: jump });
    expect(t.stats.lowest).toEqual({ price: 4.5, at: daysAgo(30) });
    expect(t.stats.highest?.price).toBe(5); // 10 (old-pack promo) and 1 (old shelf) are out
  });

  it('flags a fall by more than the ratio too, and not a move exactly at the ratio', () => {
    const down = build({
      snapshots: [{ price: 9, kind: 'normal', recordedAt: daysAgo(9) }, { price: 2.9, kind: 'normal', recordedAt: daysAgo(2) }],
    });
    expect(down.stats.suspect).toBe(true);
    const edge = build({
      snapshots: [{ price: 3, kind: 'normal', recordedAt: daysAgo(9) }, { price: 9, kind: 'normal', recordedAt: daysAgo(2) }],
    });
    expect(SUSPECT_JUMP_RATIO).toBe(3);
    expect(edge.stats.suspect).toBe(false);
  });
});

describe('stats', () => {
  it('shelfChangePct: first vs latest, one decimal; null below two distinct prices', () => {
    const two = build({
      snapshots: [{ price: 3.65, kind: 'normal', recordedAt: daysAgo(50) }, { price: 3.05, kind: 'normal', recordedAt: daysAgo(5) }],
    });
    expect(two.stats.shelfChangePct).toBe(-16.4);
    expect(two.stats.shelfFirst).toBe(3.65);
    expect(two.stats.shelfNow).toBe(3.05);
    const one = build({ snapshots: [{ price: 3, kind: 'normal', recordedAt: daysAgo(5) }] });
    expect(one.stats.shelfChangePct).toBeNull();
    // 2 -> 3 -> 2 is two distinct prices but no net change: 0, not null
    const back = build({
      snapshots: [2, 3, 2].map((price, i) => ({ price, kind: 'normal', recordedAt: daysAgo(30 - i * 10) })),
    });
    expect(back.stats.shelfChangePct).toBe(0);
    expect(back.stats.shelfChanges).toBe(2);
  });

  it('lowest/highest span every observation plus the current offer; ties give the earliest date', () => {
    const t = build({
      snapshots: [
        { price: 4, kind: 'normal', recordedAt: daysAgo(60) },
        { price: 2, kind: 'mono', recordedAt: daysAgo(40) },
        { price: 2, kind: 'mono', recordedAt: daysAgo(20) },
      ],
      offer: { price: 1.5, firstSeenAt: daysAgo(2), active: true },
    });
    expect(t.stats.lowest).toEqual({ price: 1.5, at: daysAgo(2) });
    expect(t.stats.highest).toEqual({ price: 4, at: daysAgo(60) });
    const tie = build({
      snapshots: [
        { price: 2, kind: 'mono', recordedAt: daysAgo(40) },
        { price: 2, kind: 'mono', recordedAt: daysAgo(20) },
        { price: 3, kind: 'mono', recordedAt: daysAgo(10) },
      ],
    });
    expect(tie.stats.lowest?.at).toBe(daysAgo(40));
  });

  it('currentIsLowest needs quality ok and a price range to be lowest in', () => {
    const flat = build({
      snapshots: [{ price: 2, kind: 'normal', recordedAt: daysAgo(30) }, { price: 2, kind: 'mono', recordedAt: daysAgo(5) }],
      offer: { price: 2, firstSeenAt: daysAgo(5), active: true },
    });
    expect(flat.stats.currentIsLowest).toBe(false); // a flat line is not a record low
    const thin = build({ offer: { price: 2, firstSeenAt: daysAgo(1), active: true } });
    expect(thin.quality).toBe('thin');
    expect(thin.stats.currentIsLowest).toBe(false);
    const low = build({
      snapshots: [{ price: 3, kind: 'normal', recordedAt: daysAgo(30) }],
      offer: { price: 2, firstSeenAt: daysAgo(1), active: true },
    });
    expect(low.stats.currentIsLowest).toBe(true);
  });

  it('currentPrice is the active offer, else the shelf price, else null', () => {
    const snapshots = [{ price: 3, kind: 'normal', recordedAt: daysAgo(30) }];
    expect(build({ snapshots, offer: { price: 2, firstSeenAt: daysAgo(1), active: true } }).stats.currentPrice).toBe(2);
    expect(build({ snapshots, offer: { price: 2, firstSeenAt: daysAgo(1), active: false } }).stats.currentPrice).toBe(3);
    expect(build({}).stats.currentPrice).toBeNull();
  });

  it('promoCount counts promos, including the synthesised one', () => {
    const t = build({ offer: { price: 2, firstSeenAt: daysAgo(1), active: true } });
    expect(t.stats.promoCount).toBe(1);
  });
});

describe('quality, since, daysTracked', () => {
  it('none / thin / ok', () => {
    const none = build({});
    expect(none).toMatchObject({ quality: 'none', since: null, daysTracked: 0, shelf: [], promos: [] });
    expect(none.stats.lowest).toBeNull();
    expect(build({ snapshots: [{ price: 1, kind: 'mono', recordedAt: daysAgo(3) }] }).quality).toBe('thin');
    expect(build({ snapshots: [1, 2].map((price, i) => ({ price, kind: 'mono', recordedAt: daysAgo(3 - i) })) }).quality).toBe('ok');
  });

  it('since is the first observation of any kind; daysTracked counts whole days to now', () => {
    const t = build({
      snapshots: [{ price: 1, kind: 'mono', recordedAt: daysAgo(20.5) }, { price: 2, kind: 'normal', recordedAt: daysAgo(100) }],
    });
    expect(t.since).toBe(daysAgo(100));
    expect(t.daysTracked).toBe(100);
  });

  it('accepts Date objects and a clock-skewed future snapshot (clamped to now)', () => {
    const t = build({ snapshots: [{ price: 1, kind: 'mono', recordedAt: new Date(now.getTime() + 5 * 86400000) }] });
    expect(t.promos[0].at).toBe(now.toISOString());
  });
});
