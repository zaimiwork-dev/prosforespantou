// The shelf price a ΜΟΝΟ offer should be judged against (W2a, 2026-09-16).
//
// 94% of offers are ΜΟΝΟ: the chain prints a price but no «was» price. For
// ~7.5k of them we hold the SAME chain's shelf price from its catalog feed.
// This module turns that into `baselinePrice` + `impliedPercent`, persisted by
// recompute-price-verdicts.mjs, so a card can later say «κανονικά ~Y€»
// (rendering waits on owner decision #2; the number is ours, not the chain's).
//
// Semantics are exactly the comparison sheet's «Κανονική τιμή · ελέγχθηκε»
// row (lib/shelf-comparison pickShelfRows): the LATEST `normal` snapshot, only
// while the chain's catalog feed is alive (lib/feed-freshness), dated by that
// feed run. Not a median: snapshots are written only when a price CHANGES, so
// a 90-day median lags every price move and misses stable prices entirely.
// Measured 2026-09-16 over live ΜΟΝΟ offers: latest-price covers 7,476 offers
// vs 4,981 for the 90-day median, and the median was >5% off for 480 of the
// 4,981 (AB's frozen range read «25% dearer than normal» because its shelf
// prices had risen and the median had not caught up).
//
// Pure + strip-safe (no enums) for the .mjs scripts.

import { pickShelfRows, type ShelfSnapshotInput } from './shelf-comparison.ts';
import type { FreshChains } from './feed-freshness.ts';

// A shelf price more than 3× the offer is a different pack or a bad match,
// not a 67%+ saving (16 such rows on 2026-09-16).
export const BASELINE_MAX_RATIO = 3;

export type ShelfPrice = { price: number; checkedAt: string };

export type Baseline = {
  baselinePrice: number;
  baselineAt: Date;
  // Rounded % below the shelf price. Zero or negative means the «offer» is not
  // cheaper than the chain's own shelf price — kept, so the UI can stay silent.
  impliedPercent: number;
};

export function isMonoOffer(o: { offerType?: string | null; originalPrice?: number | null }): boolean {
  if (o.offerType === 'mono') return true;
  if (o.offerType === 'strikethrough') return false;
  return o.originalPrice == null;
}

// ── «κανονικά» = the price the product USUALLY has (owner, 2026-11-22) ──────
// Not the lowest, not the highest: the price this chain charged for most of the
// last 90 days. Measured on 1,311 live ΜΟΝΟ offers (2026-11-22): the latest
// shelf reading — the rule until then — differed from that usual price by 5%+
// for ~6%, both ways: a wine whose shelf price was raised 5,86 → 9,30 three
// weeks before a 5,58 offer read «κανονικά 9,30» (a 40% saving nobody gets),
// and chains whose catalogue reports the promo price as the shelf price lost
// the real normal price. A price that has itself held NEW_NORMAL_DAYS is a
// genuine price change and becomes the usual price — the reason the earlier
// 90-day MEDIAN was rejected (it lagged every real price rise, see above).
export const USUAL_PRICE_WINDOW_DAYS = 90;
export const NEW_NORMAL_DAYS = 30;

/**
 * The price that held the most days in the last USUAL_PRICE_WINDOW_DAYS, from
 * one chain's `normal` snapshots of one product (each price holds until the
 * next reading; the reading in force when the window opens counts from the
 * window start). A latest price that has held NEW_NORMAL_DAYS wins outright.
 * Ties go to the more recent price. Null when there are no usable readings.
 */
export function usualShelfPrice(snapshots: ShelfSnapshotInput[], now: Date = new Date()): number | null {
  const DAY = 86400000;
  const rows = snapshots
    .map((s) => ({ price: s.price, at: new Date(s.recordedAt).getTime() }))
    .filter((s) => typeof s.price === 'number' && Number.isFinite(s.price) && s.price > 0 && Number.isFinite(s.at) && s.at <= now.getTime())
    .sort((a, b) => a.at - b.at);
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  if (now.getTime() - latest.at >= NEW_NORMAL_DAYS * DAY) return latest.price;
  const start = now.getTime() - USUAL_PRICE_WINDOW_DAYS * DAY;
  const held = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  rows.forEach((s, i) => {
    lastSeen.set(s.price, s.at);
    const end = i + 1 < rows.length ? rows[i + 1].at : now.getTime();
    const from = Math.max(s.at, start);
    if (end > from) held.set(s.price, (held.get(s.price) ?? 0) + (end - from));
  });
  if (held.size === 0) return latest.price;
  return [...held.entries()].sort((a, b) => b[1] - a[1] || (lastSeen.get(b[0]) ?? 0) - (lastSeen.get(a[0]) ?? 0))[0][0];
}

// The chain's normal shelf price for a product, or null: its usual price
// (usualShelfPrice), dated by the feed run that last confirmed the catalogue,
// and only while that feed is alive. `normalSnapshots` must already be
// kind='normal' for that product (any chain; filtered here).
export function shelfPriceFor({
  supermarket,
  normalSnapshots,
  freshChains,
  now = new Date(),
}: {
  supermarket: string | null | undefined;
  normalSnapshots: ShelfSnapshotInput[];
  freshChains: FreshChains;
  now?: Date;
}): ShelfPrice | null {
  if (!supermarket) return null;
  const own = normalSnapshots.filter((s) => s.supermarket === supermarket);
  const row = pickShelfRows({ snapshots: own, excludedChains: [], freshChains, now })[0];
  if (!row) return null;
  return { price: usualShelfPrice(own, now) ?? row.price, checkedAt: row.checkedAt };
}

// A «ΜΟΝΟ» price the chain has been charging for MONTHS is the standing price,
// not a promotion, however old the catalogue's «normal» price looks. Measured
// case (2026-09-16): My Market's «Softex Pro+ Ρολό Κουζίνας» sat at 2.80-2.82
// from 24/06 to 03/09 while the shelf row still said 5.60 — «κανονικά ~5.60€»
// would have claimed a 50% saving that nobody can get. So: if this chain
// charged about today's price (within 10%) at least 45 days ago, the shelf
// number has been overtaken and no baseline is claimed.
export const STANDING_PRICE_DAYS = 45;
export const STANDING_PRICE_RATIO = 1.1;
// A catalogue «normal» price that the chain's own older ΜΟΝΟ prices undercut by
// more than 15% has been overtaken. Measured case: Kritikos' Softex Silk 8T had
// one shelf row (8.50, 13/06) and has charged 4.68 → 3.83 ever since, which
// would have read «κανονικά ~8.50€» — a 55% saving nobody could get.
export const SHELF_UNDERCUT_RATIO = 0.85;

export function isStandingPrice({
  offerPrice,
  shelfPrice,
  monoSnapshots,
  now = new Date(),
}: {
  offerPrice: number;
  // When given, an older ΜΟΝΟ price well below it also disqualifies the shelf.
  shelfPrice?: number | null;
  monoSnapshots: ShelfSnapshotInput[];
  now?: Date;
}): boolean {
  const cutoff = now.getTime() - STANDING_PRICE_DAYS * 86400000;
  return monoSnapshots.some((s) => {
    if (!(typeof s.price === 'number') || !Number.isFinite(s.price) || s.price <= 0) return false;
    const atOfferLevel = s.price <= offerPrice * STANDING_PRICE_RATIO;
    const undercutsShelf = shelfPrice != null && Number.isFinite(shelfPrice) && s.price <= shelfPrice * SHELF_UNDERCUT_RATIO;
    if (!atOfferLevel && !undercutsShelf) return false;
    const at = new Date(s.recordedAt).getTime();
    return Number.isFinite(at) && at <= cutoff;
  });
}

export function computeBaseline({
  supermarket,
  discountedPrice,
  offerType,
  originalPrice,
  normalSnapshots,
  monoSnapshots = [],
  freshChains,
  now = new Date(),
}: {
  supermarket: string | null | undefined;
  discountedPrice: number | null | undefined;
  offerType?: string | null;
  originalPrice?: number | null;
  normalSnapshots: ShelfSnapshotInput[];
  // Same product + chain, kind='mono' — evidence of a standing price.
  monoSnapshots?: ShelfSnapshotInput[];
  freshChains: FreshChains;
  now?: Date;
}): Baseline | null {
  if (!isMonoOffer({ offerType, originalPrice })) return null;
  if (discountedPrice == null || !Number.isFinite(discountedPrice) || discountedPrice <= 0) return null;
  const shelf = shelfPriceFor({ supermarket, normalSnapshots, freshChains, now });
  if (!shelf) return null;
  if (shelf.price > discountedPrice * BASELINE_MAX_RATIO) return null;
  const own = monoSnapshots.filter((s) => s.supermarket === supermarket);
  if (isStandingPrice({ offerPrice: discountedPrice, shelfPrice: shelf.price, monoSnapshots: own, now })) return null;
  return {
    baselinePrice: shelf.price,
    baselineAt: new Date(shelf.checkedAt),
    impliedPercent: Math.round((1 - discountedPrice / shelf.price) * 100),
  };
}

// ── Card rendering (owner decision #2, approved 2026-09-16) ─────────────────
// The card line is OUR inference from the chain's own catalogue, never a price
// the chain advertised, so it is a quiet grey note («κανονικά ~2,45 €»), never
// a struck-through «was» price. Shown only well clear of rounding and of a
// shelf price that moved a little: 10%+ below shelf. Chains whose ΜΟΝΟ offers
// sit at shelf price (AB, measured 2026-09-16) show nothing at all.
export const BASELINE_MIN_PERCENT = 10;
// …and an upper bound. Above ~50% the number is far more often our data being
// wrong than a real promotion. Measured 2026-09-16: My Market's «Belle Τηγάνι»
// showed a 17.98 shelf row a week after 7.19 at the same shop (a misread), and
// Fairy Platinum 19τεμ and 30τεμ share ONE product record, so the 19-pack was
// being compared with the 30-pack's shelf price. The value is still stored —
// only the card claim is suppressed. (Follow-up: the shared-product case is a
// matching bug that also affects the comparison sheet.)
export const BASELINE_MAX_PERCENT = 50;

export type CardBaseline = { price: number; percent: number; checkedAt: Date | null };

export function baselineForCard(
  deal: {
    baselinePrice?: number | null; baseline_price?: number | null;
    impliedPercent?: number | null; implied_percent?: number | null;
    baselineAt?: Date | string | null; baseline_at?: Date | string | null;
    originalPrice?: number | null; original_price?: number | null;
  } | null | undefined,
  minPercent: number = BASELINE_MIN_PERCENT
): CardBaseline | null {
  if (!deal) return null;
  // A chain-published «was» price is the honest one; never show both.
  if ((deal.originalPrice ?? deal.original_price) != null) return null;
  const price = deal.baselinePrice ?? deal.baseline_price;
  const percent = deal.impliedPercent ?? deal.implied_percent;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (percent == null || !Number.isFinite(percent) || percent < minPercent) return null;
  if (percent > BASELINE_MAX_PERCENT) return null;
  const rawAt = deal.baselineAt ?? deal.baseline_at ?? null;
  const at = rawAt ? new Date(rawAt) : null;
  return { price, percent, checkedAt: at && Number.isFinite(at.getTime()) ? at : null };
}
