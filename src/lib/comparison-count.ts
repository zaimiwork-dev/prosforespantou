// How many OTHER chains an offer's price-comparison sheet would render rows
// for. This is the precompute twin of actions/get-price-comparison.ts —
// KEEP THE GUARD CHAIN IN LOCKSTEP with that action (samePack →
// filterComparable → slice(8) for offer rows; barcode-gated pickShelfRows
// with the same chain exclusions for shelf rows). A count that disagrees
// with what the sheet actually shows is a lying chip.
//
// Used by src/scripts/recompute-comparison-counts.mjs (nightly) to fill
// Discount.comparisonCount, which DiscountCard renders as
// «Τιμές σε N καταστήματα».

// Explicit .ts extensions: this module is imported by node-run scripts
// (recompute-comparison-counts.mjs) where type-stripping needs them.
import { samePack } from './packaging.ts';
import { filterComparable } from './offer-similarity.ts';
import { pickShelfRows, type ShelfSnapshotInput } from './shelf-comparison.ts';
import type { FreshChains } from './feed-freshness.ts';

export type ComparisonCandidate = {
  productName: string;
  supermarket: string | null;
  // The offer price the sheet prints for this row (Discount.discountedPrice).
  discountedPrice?: number | null;
};

// One row the comparison sheet renders for ANOTHER chain.
export type RivalRow = {
  supermarket: string;
  price: number | null;
  rowType: 'offer' | 'shelf';
};

type ComparisonArgs = {
  source: ComparisonCandidate;
  // Active, publicly-visible offers on the same matched product cluster,
  // EXCLUDING the source row itself (caller applies visibility + activity).
  clusterOffers: ComparisonCandidate[];
  barcodeBacked?: boolean;
  // kind='normal' snapshots for the cluster's productIds (feed freshness +
  // chain exclusions are enforced here via pickShelfRows).
  snapshots?: ShelfSnapshotInput[];
  // Chains whose catalog feed is alive (lib/feed-freshness). Must be the same
  // map the action loads, or the chip and the sheet disagree.
  freshChains?: FreshChains;
  now?: Date;
};

// The rows the sheet shows for other chains, with their prices.
export function comparisonRivals({
  source,
  clusterOffers,
  barcodeBacked = false,
  snapshots = [],
  freshChains = new Map(),
  now = new Date(),
}: ComparisonArgs): RivalRow[] {
  const rows: RivalRow[] = [];

  // Offer rows — same pipeline as the action: pack guard, then the
  // variant/quantity/similarity/per-chain-best filter, then the 8-row cap.
  const sameSize = clusterOffers.filter((d) => samePack(source.productName, d.productName));
  const comparable = filterComparable(
    source.productName,
    sameSize,
    (d) => d.productName,
    (d) => d.supermarket
  ).slice(0, 8);
  for (const d of comparable) {
    if (d.supermarket && d.supermarket !== source.supermarket) {
      rows.push({ supermarket: d.supermarket, price: d.discountedPrice ?? null, rowType: 'offer' });
    }
  }

  // Shelf rows — barcode-gated only (snapshots carry no chain-side name, so
  // the guards above can't vet them). Excluded chains mirror the action: the
  // source chain plus EVERY chain that had a cluster offer, even one the
  // guards dropped — its snapshot shares the same mapping risk.
  if (barcodeBacked) {
    const excludedChains = new Set<string>();
    if (source.supermarket) excludedChains.add(source.supermarket);
    for (const d of clusterOffers) if (d.supermarket) excludedChains.add(d.supermarket);
    for (const row of pickShelfRows({ snapshots, excludedChains, freshChains, now })) {
      rows.push({ supermarket: row.supermarket, price: row.price, rowType: 'shelf' });
    }
  }

  return rows;
}

export function comparisonChainCount(args: ComparisonArgs): number {
  return new Set(comparisonRivals(args).map((r) => r.supermarket)).size;
}

// «Cheapest here» (W3a, 2026-09-16): the source offer costs no more than ANY
// row its comparison sheet shows for another chain — rival offers and rival
// shelf prices alike (the pack guard already made the sizes equal). Needs at
// least one rival: with nothing to beat, there is no claim. A rival row with
// an unknown price blocks the claim rather than being skipped.
export const CHEAPEST_EPSILON = 0.005;

export function isCheapestInCluster(sourcePrice: number | null | undefined, rivals: RivalRow[]): boolean {
  if (sourcePrice == null || !Number.isFinite(sourcePrice) || sourcePrice <= 0) return false;
  if (rivals.length === 0) return false;
  return rivals.every((r) => r.price != null && Number.isFinite(r.price) && sourcePrice <= r.price + CHEAPEST_EPSILON);
}
