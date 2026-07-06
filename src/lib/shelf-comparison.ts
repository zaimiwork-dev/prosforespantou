// Shelf-price rows for the cross-chain comparison table (owner decision
// 2026-07-06): when another chain has NO active offer on the same product, we
// still show its latest recorded normal shelf price, labeled «Κανονική τιμή»
// with an as-of date — instead of an empty/one-row table.
//
// Safety model (why this is comparison-safe without per-chain names):
// PriceSnapshot rows carry no chain-side product name, so the usual
// variant/pack guards can't run here. Callers therefore only request shelf
// rows for BARCODE-BACKED products (GTIN identity — the strong cluster), and
// this module enforces recency + one-row-per-chain + chain exclusions.
// kind='normal' rows are written exclusively by the catalog scrapers, never by
// offer ingest, so a promo price can never surface as a shelf price.

export const SHELF_PRICE_MAX_AGE_DAYS = 14;

export type ShelfSnapshotInput = {
  supermarket: string | null;
  price: number;
  recordedAt: Date | string;
};

export type ShelfRow = {
  rowType: 'shelf';
  id: string;
  supermarket: string;
  price: number;
  recordedAt: string; // ISO
};

export function pickShelfRows({
  snapshots,
  excludedChains,
  now = new Date(),
  maxAgeDays = SHELF_PRICE_MAX_AGE_DAYS,
}: {
  snapshots: ShelfSnapshotInput[];
  excludedChains: Iterable<string>;
  now?: Date;
  maxAgeDays?: number;
}): ShelfRow[] {
  const excluded = new Set(excludedChains);
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

  // Latest snapshot per chain, recency-gated. Catalogs refresh weekly, so a
  // snapshot older than the cutoff means the chain's feed is unhealthy — a
  // stale number presented as "the shelf price" would be a lie.
  const latest = new Map<string, { price: number; at: number }>();
  for (const s of snapshots) {
    if (!s.supermarket || excluded.has(s.supermarket)) continue;
    if (!(typeof s.price === 'number') || !Number.isFinite(s.price) || s.price <= 0) continue;
    const at = new Date(s.recordedAt).getTime();
    if (!Number.isFinite(at) || at < cutoff || at > now.getTime() + 60_000) continue;
    const prev = latest.get(s.supermarket);
    if (!prev || at > prev.at) latest.set(s.supermarket, { price: s.price, at });
  }

  return [...latest.entries()]
    .map(([supermarket, v]): ShelfRow => ({
      rowType: 'shelf',
      id: `shelf:${supermarket}`,
      supermarket,
      price: v.price,
      recordedAt: new Date(v.at).toISOString(),
    }))
    .sort((a, b) => a.price - b.price);
}
