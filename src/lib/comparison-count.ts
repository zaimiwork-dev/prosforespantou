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

export type ComparisonCandidate = {
  productName: string;
  supermarket: string | null;
};

export function comparisonChainCount({
  source,
  clusterOffers,
  barcodeBacked = false,
  snapshots = [],
  now = new Date(),
}: {
  source: ComparisonCandidate;
  // Active, publicly-visible offers on the same matched product cluster,
  // EXCLUDING the source row itself (caller applies visibility + activity).
  clusterOffers: ComparisonCandidate[];
  barcodeBacked?: boolean;
  // kind='normal' snapshots for the cluster's productIds (recency + chain
  // exclusions are enforced here via pickShelfRows).
  snapshots?: ShelfSnapshotInput[];
  now?: Date;
}): number {
  const chains = new Set<string>();

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
    if (d.supermarket && d.supermarket !== source.supermarket) chains.add(d.supermarket);
  }

  // Shelf rows — barcode-gated only (snapshots carry no chain-side name, so
  // the guards above can't vet them). Excluded chains mirror the action: the
  // source chain plus EVERY chain that had a cluster offer, even one the
  // guards dropped — its snapshot shares the same mapping risk.
  if (barcodeBacked) {
    const excludedChains = new Set<string>();
    if (source.supermarket) excludedChains.add(source.supermarket);
    for (const d of clusterOffers) if (d.supermarket) excludedChains.add(d.supermarket);
    for (const row of pickShelfRows({ snapshots, excludedChains, now })) {
      chains.add(row.supermarket);
    }
  }

  return chains.size;
}
