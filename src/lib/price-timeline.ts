// A truthful price timeline for one product AT ONE CHAIN (SRV-01, 2026-11-11).
//
// price_snapshots are written only when a price CHANGES, and nothing is written
// when an offer ENDS (the shelf price did not change). So the old chart, which
// pooled every kind into one staircase, showed a two-week promo as a permanent
// price. This keeps the two things apart:
//   - SHELF  = the chain's regular price, from `normal` snapshots: true steps.
//   - PROMOS = offer prices (`mono` / `strikethrough` / legacy null): POINTS in
//     time with an end we only know when the data says so, never invented.
//
// No «% off» is computed here on purpose: the guarded «κανονικά ~X €» baseline
// lives in lib/baseline-price.ts and on DealCard.baseline; a second, unguarded
// number would contradict it.
//
// Pure + strip-safe (no enums/namespaces; no prisma; `now` is injectable) so
// node scripts can import it and the app can import its types.

export type TimelineSnapshot = {
  price: number;
  kind: string | null;
  recordedAt: string | Date;
  // When the offer pipeline last still saw this price. A column that does not
  // exist yet; until it does, every promo's end is unknown (`until: null`).
  lastSeenAt?: string | Date | null;
};

export type TimelineInput = {
  snapshots: TimelineSnapshot[]; // this product AT THIS CHAIN, any order, any age
  offer: { price: number; firstSeenAt: string | Date; active: boolean } | null; // the offer on screen
  shelfFeedAliveAt: string | Date | null; // last successful catalogue run for the chain; null = feed not alive
  // Several SKUs of THIS chain are mapped to this one product record (other pack
  // sizes, or plain mis-mappings). Snapshots hang off the product, not the SKU,
  // so the series then mixes packs and nothing drawn from it can be trusted.
  mixedSkus?: boolean;
  now?: Date;
};

export type PriceTimeline = {
  since: string | null; // first observation of any kind
  daysTracked: number;
  shelf: { from: string; to: string; price: number }[]; // regular price as true steps
  promos: {
    at: string;
    until: string | null;
    price: number;
    kind: 'mono' | 'strikethrough' | 'legacy';
    ongoing: boolean;
  }[];
  stats: {
    shelfNow: number | null;
    shelfFirst: number | null;
    shelfChangePct: number | null;
    shelfChanges: number;
    lowest: { price: number; at: string } | null;
    highest: { price: number; at: string } | null;
    promoCount: number;
    currentPrice: number | null;
    currentIsLowest: boolean;
    suspect: boolean;
  };
  quality: 'none' | 'thin' | 'ok'; // none: nothing observed; thin: one observation; ok: two or more
  // False when the series cannot be shown as THIS item's history: mixed SKUs, a
  // suspect shelf jump, or a shelf price more than 3x away from the price on
  // screen. Measured 2026-11-12: 11 % of live offers sit on a product shared by
  // several SKUs of one chain — a chicken fillet at 7,49 € showed «lowest 2,99 €»
  // from another pack. The app draws no chart and makes no claim when false.
  reliable: boolean;
};

// A shelf change by more than this factor (either direction) is far more likely
// a pack-size or product-mapping change than a price move.
export const SUSPECT_JUMP_RATIO = 3;

const DAY_MS = 86400000;
const EPS = 0.005; // half a cent: prices are stored as floats

type Promo = PriceTimeline['promos'][number];

function ms(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
const iso = (t: number) => new Date(t).toISOString();
const validPrice = (p: unknown): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0;

function promoKind(kind: string | null): Promo['kind'] {
  // null = legacy April-June rows, all written by offer pipelines (unknown type).
  // Any other unrecognised kind is also an offer of unknown type.
  return kind === 'mono' || kind === 'strikethrough' ? kind : 'legacy';
}

export function buildPriceTimeline(input: TimelineInput): PriceTimeline {
  const nowMs = (input.now ?? new Date()).getTime();

  // Normalise: drop unusable rows, sort oldest first. A snapshot "from the
  // future" is clock skew, not evidence: clamp it to now.
  const snaps = input.snapshots
    .map((s) => ({ price: s.price, kind: s.kind ?? null, at: ms(s.recordedAt), seen: ms(s.lastSeenAt) }))
    .filter((s): s is { price: number; kind: string | null; at: number; seen: number | null } => s.at != null && validPrice(s.price))
    .map((s) => ({ ...s, at: Math.min(s.at, nowMs) }))
    .sort((a, b) => a.at - b.at);

  // ---- Shelf: only `normal` snapshots; each holds until the next one. ----
  const normals = snaps.filter((s) => s.kind === 'normal');
  const aliveAt = ms(input.shelfFeedAliveAt);
  const shelf: PriceTimeline['shelf'] = [];
  for (const s of normals) {
    const last = shelf[shelf.length - 1];
    // Consecutive equal prices merge into one step (the later row repeats it).
    if (last && Math.abs(last.price - s.price) < EPS) continue;
    if (last) last.to = iso(s.at); // the previous step ends where this one starts
    shelf.push({ from: iso(s.at), to: iso(s.at), price: s.price });
  }
  if (shelf.length > 0) {
    const lastNormalAt = normals[normals.length - 1].at;
    // Catalogue still being read after the last write => no change means same
    // price, so it holds until that run. A dead/unknown feed proves nothing past
    // the row's own timestamp.
    const end = aliveAt != null && aliveAt > lastNormalAt ? Math.min(aliveAt, nowMs) : lastNormalAt;
    shelf[shelf.length - 1].to = iso(end);
  }

  // ---- Promos: every non-normal snapshot, a point with an unknown end. ----
  const promos: Promo[] = snaps
    .filter((s) => s.kind !== 'normal')
    .map((s) => ({
      at: iso(s.at),
      // Only the data may close a promo; never stretch it to the next snapshot
      // (an offer's end writes nothing, so the next row says nothing about it).
      until: s.seen != null && s.seen >= s.at ? iso(Math.min(s.seen, nowMs)) : null,
      price: s.price,
      kind: promoKind(s.kind),
      ongoing: false,
    }));

  // ---- Foreign points ----
  // A promo more than 3x away from the shelf price in force at that moment is
  // not a deep discount, it is another product: mappings were re-pointed over
  // the months and old snapshots stayed on the product they were first filed
  // under (measured 2026-11-12: «lowest 2,99 €» on a 9,95 €/kg chicken fillet).
  // Without any shelf price the reference is the price on screen.
  const shelfAt = (t: number): number | null => {
    if (shelf.length === 0) return null;
    let price = shelf[0].price; // before the first step: the earliest shelf price we know
    for (const s of shelf) if (Date.parse(s.from) <= t) price = s.price;
    return price;
  };
  const screenPrice = input.offer != null && validPrice(input.offer.price) ? input.offer.price : null;
  for (let i = promos.length - 1; i >= 0; i--) {
    const ref = shelfAt(Date.parse(promos[i].at)) ?? screenPrice;
    if (ref == null) continue;
    const r = promos[i].price / ref;
    if (r > SUSPECT_JUMP_RATIO || r < 1 / SUSPECT_JUMP_RATIO) promos.splice(i, 1);
  }

  // ---- The offer on screen: the chart must end at the price the shopper sees. ----
  const offerOk = input.offer != null && validPrice(input.offer.price);
  const activeOffer = offerOk && input.offer!.active ? input.offer! : null;
  let synthesised = false;
  if (activeOffer) {
    let idx = -1;
    for (let i = promos.length - 1; i >= 0; i--) {
      if (Math.abs(promos[i].price - activeOffer.price) < EPS) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      promos[idx].ongoing = true;
      promos[idx].until = iso(nowMs);
    } else {
      // No snapshot carries this price (a write is skipped when the price equals
      // the previous snapshot), so draw it from when the offer first appeared.
      const first = ms(activeOffer.firstSeenAt);
      const at = first != null ? Math.min(first, nowMs) : nowMs;
      promos.push({ at: iso(at), until: iso(nowMs), price: activeOffer.price, kind: 'legacy', ongoing: true });
      promos.sort((a, b) => a.at.localeCompare(b.at));
      synthesised = true;
    }
  }

  // ---- Provenance ----
  const times = [...snaps.map((s) => s.at), ...promos.map((p) => Date.parse(p.at))];
  const sinceMs = times.length ? Math.min(...times) : null;
  const observations = snaps.length + (synthesised ? 1 : 0);
  const quality: PriceTimeline['quality'] = observations === 0 ? 'none' : observations === 1 ? 'thin' : 'ok';

  // ---- Suspect jumps ----
  // A shelf step by more than 3x either way: keep the steps (they are what we
  // hold) but do not call it a price move.
  let lastJumpIdx = -1;
  for (let i = 1; i < shelf.length; i++) {
    const r = shelf[i].price / shelf[i - 1].price;
    if (r > SUSPECT_JUMP_RATIO || r < 1 / SUSPECT_JUMP_RATIO) lastJumpIdx = i;
  }
  const suspect = lastJumpIdx >= 0;

  // ---- Stats ----
  const shelfNow = shelf.length ? shelf[shelf.length - 1].price : null;
  const shelfFirst = shelf.length ? shelf[0].price : null;
  const distinctShelf = new Set(shelf.map((s) => s.price.toFixed(2))).size;
  const shelfChangePct =
    !suspect && distinctShelf >= 2 && shelfFirst != null && shelfNow != null
      ? Math.round(((shelfNow - shelfFirst) / shelfFirst) * 1000) / 10
      : null;

  // lowest/highest: over every observation plus the current offer price. After a
  // suspect jump the observations BEFORE the last jump belong to a different
  // pack/product (shelf steps and promos alike), so they are excluded and the
  // extremes describe only the regime the shopper faces today.
  const cutoff = lastJumpIdx >= 0 ? Date.parse(shelf[lastJumpIdx].from) : -Infinity;
  const obs: { price: number; at: number }[] = [
    ...shelf.map((s) => ({ price: s.price, at: Date.parse(s.from) })),
    ...promos.map((p) => ({ price: p.price, at: Date.parse(p.at) })),
  ].filter((o) => o.at >= cutoff);
  let lowest: { price: number; at: string } | null = null;
  let highest: { price: number; at: string } | null = null;
  // Strict comparisons + chronological order => ties report the earliest date.
  obs.sort((a, b) => a.at - b.at);
  for (const o of obs) {
    if (!lowest || o.price < lowest.price - EPS) lowest = { price: o.price, at: iso(o.at) };
    if (!highest || o.price > highest.price + EPS) highest = { price: o.price, at: iso(o.at) };
  }

  const currentPrice = activeOffer ? activeOffer.price : shelfNow;
  // An offer at a third of the shelf price (or three times it) is the same
  // signal as a 3x shelf jump: two different things under one product record.
  const shelfGap = shelfNow != null && currentPrice != null ? shelfNow / currentPrice : 1;
  const reliable = !input.mixedSkus && !suspect && shelfGap <= SUSPECT_JUMP_RATIO && shelfGap >= 1 / SUSPECT_JUMP_RATIO;
  // «Lowest» is only a claim when there is history to be lowest in, and prices
  // actually differ (a flat line is not a record low).
  const currentIsLowest =
    reliable &&
    quality === 'ok' &&
    currentPrice != null &&
    lowest != null &&
    highest != null &&
    highest.price - lowest.price >= EPS &&
    currentPrice <= lowest.price + EPS;

  return {
    since: sinceMs != null ? iso(sinceMs) : null,
    daysTracked: sinceMs != null ? Math.max(0, Math.floor((nowMs - sinceMs) / DAY_MS)) : 0,
    shelf,
    promos,
    stats: {
      shelfNow,
      shelfFirst,
      shelfChangePct,
      shelfChanges: Math.max(0, shelf.length - 1),
      lowest,
      highest,
      promoCount: promos.length,
      currentPrice,
      currentIsLowest,
      suspect,
    },
    quality,
    reliable,
  };
}
