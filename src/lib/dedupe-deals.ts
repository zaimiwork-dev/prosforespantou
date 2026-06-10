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

export function dedupeDeals<T extends DedupableDeal>(deals: T[]): T[] {
  const byProduct = collapseBy(deals, (d) =>
    d.productId ? `p:${d.productId}:${d.supermarket}` : `i:${d.id}`
  );
  return collapseBy(byProduct, (d) =>
    `n:${(d.productName || '').toLowerCase().trim()}:${d.supermarket}`
  );
}
