// Shelf-price rows for the cross-chain comparison table (owner decision
// 2026-07-06): when another chain has NO active offer on the same product, we
// still show its latest recorded normal shelf price, labeled «Κανονική τιμή»
// with a checked-on date — instead of an empty/one-row table.
//
// Safety model (why this is comparison-safe without per-chain names):
// PriceSnapshot rows carry no chain-side product name, so the usual
// variant/pack guards can't run here. Callers therefore only request shelf
// rows for BARCODE-BACKED products (GTIN identity — the strong cluster), and
// this module enforces one-row-per-chain + chain exclusions + FEED FRESHNESS.
// kind='normal' rows are written exclusively by the catalog scrapers, never by
// offer ingest, so a promo price can never surface as a shelf price.
//
// Freshness (changed 2026-09-15): the gate used to be "snapshot younger than
// 14 days", which threw away ~96% of held shelf prices because snapshots are
// written only on price CHANGE — a stable price had no recent row. The gate is
// now "the chain's catalog feed is alive" (lib/feed-freshness.ts): a chain
// appears in `freshChains` when its last representative healthy catalog run
// is recent, and its latest snapshot — however old — is then current by
// construction. `maxAgeDays` remains only as a sanity cap.

import type { FreshChains } from './feed-freshness.ts';

// Sanity cap on snapshot age even for a fresh chain (a product the chain has
// not listed for half a year is not "on the shelf" at that price).
export const SHELF_PRICE_MAX_AGE_DAYS = 180;

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
  recordedAt: string; // ISO — when the price last moved
  checkedAt: string; // ISO — when the chain's feed last confirmed its catalog
};

export function pickShelfRows({
  snapshots,
  excludedChains,
  freshChains,
  now = new Date(),
  maxAgeDays = SHELF_PRICE_MAX_AGE_DAYS,
}: {
  snapshots: ShelfSnapshotInput[];
  excludedChains: Iterable<string>;
  // chain → ISO of the run that proves its feed is alive. A chain absent here
  // renders NO shelf row, whatever its snapshots say.
  freshChains: FreshChains;
  now?: Date;
  maxAgeDays?: number;
}): ShelfRow[] {
  const excluded = new Set(excludedChains);
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

  // Latest snapshot per FRESH chain.
  const latest = new Map<string, { price: number; at: number }>();
  for (const s of snapshots) {
    if (!s.supermarket || excluded.has(s.supermarket)) continue;
    if (!freshChains.has(s.supermarket)) continue;
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
      checkedAt: freshChains.get(supermarket) as string,
    }))
    .sort((a, b) => a.price - b.price);
}
