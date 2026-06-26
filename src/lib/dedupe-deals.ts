// One card per real-world offer at a chain.
//
// Two ways the same shelf item ends up as multiple rows (both real in the DB,
// both wrong to render twice):
//   1. Multi-source: one Product, one row per source (web + leaflet) — a DATA
//      invariant per PHASES.md. (lib/group-deals.js merges these with source
//      tags where richer cards are wanted.)
//   2. Catalog dupes: two Product rows for the same item (stale mis-mappings),
//      so the SAME name at the SAME chain appears under two productIds.
// Collapsing therefore runs on BOTH keys: (productId, chain) and then
// (normalized name, chain). First occurrence keeps the list position (lists
// arrive ranked); a cheaper duplicate wins the slot's price.
import { areComparableNames } from './offer-similarity';

type DedupableDeal = {
  id?: string;
  productId?: string | null;
  productName?: string | null;
  supermarket?: string | null;
  discountedPrice?: number | null;
};

function collapseBy<T extends DedupableDeal>(deals: T[], keyOf: (d: T) => string): T[] {
  const byKey = new Map<string, T>();
  const order: string[] = [];
  for (const d of deals) {
    const key = keyOf(d);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, d);
      order.push(key);
      continue;
    }
    if (Number(d.discountedPrice ?? Infinity) < Number(prev.discountedPrice ?? Infinity)) {
      byKey.set(key, d);
    }
  }
  return order.map((k) => byKey.get(k) as T);
}

function collapseComparableProductRows<T extends DedupableDeal>(
  deals: T[],
  acrossChains: boolean,
): T[] {
  const out: T[] = [];
  const indexesByKey = new Map<string, number[]>();
  for (const deal of deals) {
    if (!deal.productId) {
      out.push(deal);
      continue;
    }
    const key = acrossChains
      ? deal.productId
      : `${deal.productId}:${deal.supermarket ?? ''}`;
    const indexes = indexesByKey.get(key) ?? [];
    const existingIndex = indexes.find((index) =>
      areComparableNames(out[index].productName, deal.productName));
    if (existingIndex === undefined) {
      const index = out.length;
      out.push(deal);
      indexes.push(index);
      indexesByKey.set(key, indexes);
      continue;
    }
    if (Number(deal.discountedPrice ?? Infinity) < Number(out[existingIndex].discountedPrice ?? Infinity)) {
      out[existingIndex] = deal;
    }
  }
  return out;
}

export function dedupeDeals<T extends DedupableDeal>(
  deals: T[],
  opts?: { crossChain?: boolean }
): T[] {
  const byProduct = collapseComparableProductRows(deals, false);
  const byName = collapseBy(byProduct, (d) =>
    d.productName ? `n:${d.productName.toLowerCase().trim()}:${d.supermarket}` : `i:${d.id}`
  );
  if (!opts?.crossChain) return byName;

  // Showcase mode (homepage rail): when the SAME canonical product is on offer
  // at several chains, surface only the cheapest chain's row — recommending the
  // pricier chain for an identical item breaks the "honest cheapest price"
  // promise. Chain pages / search keep per-chain rows for comparison.
  const byProductAnyChain = collapseComparableProductRows(byName, true);
  return collapseBy(byProductAnyChain, (d) =>
    d.productName ? `xn:${d.productName.toLowerCase().trim()}` : `i:${d.id}`
  );
}
