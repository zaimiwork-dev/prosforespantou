// How many OTHER chains an offer's price-comparison sheet would render rows
// for. This is the precompute twin of actions/get-price-comparison.ts —
// KEEP THE GUARD CHAIN IN LOCKSTEP with that action (samePack →
// filterByVerdict → filterComparable → slice(8) for offer rows; barcode-gated pickShelfRows
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
import { filterByVerdict, type VerdictLookup } from './comparison-verdict.ts';

export type ComparisonCandidate = {
  // Offer id — only used to drop an offer that is both in the cluster and linked.
  id?: string;
  productName: string;
  supermarket: string | null;
  // The chain's own item code — the key of its AI verdicts (lib/comparison-verdict).
  chainItemcode?: string | null;
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
  // AI verdicts on cross-chain pairs (lib/comparison-verdict loadVerdictLookup,
  // whole table). Must be passed by the nightly count: without it every pair
  // counts as "not judged yet", which 'require-same' hides.
  verdictOf?: VerdictLookup;
  // Cross-chain item links (lib/item-links): live offers of items confirmed
  // to be this same product at other chains, and the regular-price snapshots
  // of each linked item AT ITS OWN CHAIN. Same inputs as the action.
  linkedOffers?: ComparisonCandidate[];
  linkedSnapshots?: ShelfSnapshotInput[];
  now?: Date;
};

// The rows the sheet shows for other chains, with their prices.
export function comparisonRivals({
  source,
  clusterOffers,
  barcodeBacked = false,
  snapshots = [],
  freshChains = new Map(),
  verdictOf = () => undefined,
  linkedOffers = [],
  linkedSnapshots = [],
  now = new Date(),
}: ComparisonArgs): RivalRow[] {
  const rows: RivalRow[] = [];
  const seenIds = new Set<string>();
  const pool = [...clusterOffers, ...linkedOffers].filter((d) => {
    if (!d.id) return true;
    if (seenIds.has(d.id)) return false;
    seenIds.add(d.id);
    return true;
  });

  // Offer rows — same pipeline as the action: pack guard, then the AI
  // verdicts, then the variant/quantity/similarity/per-chain-best filter,
  // then the 8-row cap.
  // Other chains only (the sheet never shows the shopper's own chain).
  const sameSize = pool.filter((d) =>
    d.supermarket !== source.supermarket && samePack(source.productName, d.productName));
  const sideOf = (d: ComparisonCandidate) => ({ chain: d.supermarket, code: d.chainItemcode, name: d.productName });
  const vetted = filterByVerdict(sideOf(source), sameSize, sideOf, verdictOf);
  const comparable = filterComparable(
    source.productName,
    vetted,
    (d) => d.productName,
    (d) => d.supermarket
  ).slice(0, 8);
  for (const d of comparable) {
    if (d.supermarket && d.supermarket !== source.supermarket) {
      rows.push({ supermarket: d.supermarket, price: d.discountedPrice ?? null, rowType: 'offer' });
    }
  }

  // Shelf rows from two trusted sources, as in the action: the barcode
  // cluster's snapshots (GTIN-verified), and each linked item's regular price
  // at its own chain (the link is a checked same-item verdict). Excluded chains
  // mirror the action: the source chain plus EVERY chain that had an offer
  // (cluster or linked), even one the guards dropped.
  const shelfSnaps = [...(barcodeBacked ? snapshots : []), ...linkedSnapshots];
  if (shelfSnaps.length > 0) {
    const excludedChains = new Set<string>();
    if (source.supermarket) excludedChains.add(source.supermarket);
    for (const d of pool) if (d.supermarket) excludedChains.add(d.supermarket);
    for (const row of pickShelfRows({ snapshots: shelfSnaps, excludedChains, freshChains, now })) {
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
