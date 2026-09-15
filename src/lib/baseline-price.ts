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

// The chain's current shelf price for a product, or null. `normalSnapshots`
// must already be kind='normal' for that product (any chain; filtered here).
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
  return row ? { price: row.price, checkedAt: row.checkedAt } : null;
}

export function computeBaseline({
  supermarket,
  discountedPrice,
  offerType,
  originalPrice,
  normalSnapshots,
  freshChains,
  now = new Date(),
}: {
  supermarket: string | null | undefined;
  discountedPrice: number | null | undefined;
  offerType?: string | null;
  originalPrice?: number | null;
  normalSnapshots: ShelfSnapshotInput[];
  freshChains: FreshChains;
  now?: Date;
}): Baseline | null {
  if (!isMonoOffer({ offerType, originalPrice })) return null;
  if (discountedPrice == null || !Number.isFinite(discountedPrice) || discountedPrice <= 0) return null;
  const shelf = shelfPriceFor({ supermarket, normalSnapshots, freshChains, now });
  if (!shelf) return null;
  if (shelf.price > discountedPrice * BASELINE_MAX_RATIO) return null;
  return {
    baselinePrice: shelf.price,
    baselineAt: new Date(shelf.checkedAt),
    impliedPercent: Math.round((1 - discountedPrice / shelf.price) * 100),
  };
}
