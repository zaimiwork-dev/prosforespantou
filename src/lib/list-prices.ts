// What an item costs at the OTHER chains — exactly the rows its comparison
// sheet shows (an offer there, or that chain's regular shelf price), loaded
// for many items in one batch.
//
// The rows come from comparisonRivals (lib/comparison-count), the lockstep
// twin of actions/get-price-comparison: same pack guard, AI verdicts, name
// guard, 8-row cap, links and fresh-feed shelf prices. This file only does
// the batch loading, mirroring src/scripts/recompute-comparison-counts.mjs.
//
// Explicit .ts extensions: node-run scripts import this file (fire-product-watches).
//
// Two entry points over one core (loadRivals):
//   loadListPrices(offer ids) — the shopping list (lib/list-basket) through
//     actions/get-list-prices (website) and /api/v1/list-prices (app);
//   loadItemPrices(store items) — any item, on offer or not, with its OWN
//     store's offer/shelf price too: the «Ειδοποίησέ με» check
//     (src/scripts/fire-product-watches.mjs) and the watch screens.
import { comparisonRivals, type ComparisonCandidate, type RivalRow } from './comparison-count.ts';
import { itemKey, loadVerdictLookup, pairKeyOf } from './comparison-verdict.ts';
import { linkedItems, loadLinksFor, type ItemRef } from './item-links.ts';
import { loadFreshShelfChains, type FreshChains } from './feed-freshness.ts';
import { SHELF_PRICE_MAX_AGE_DAYS, pickShelfRows, type ShelfSnapshotInput } from './shelf-comparison.ts';
import { withPublicDealVisibility } from './public-deal-filters.ts';
import type { ItemPrices } from './list-basket.ts';
import type { PricePoint } from './watch-alerts.ts';

// Structural, like the other loaders in lib (no Prisma import here).
type FindMany = { findMany(args: any): Promise<any[]> };
export type ListPricesReader = {
  discount: FindMany;
  priceSnapshot: FindMany;
  chainProductMapping: FindMany;
  ingestRun: FindMany;
  comparisonVerdict: FindMany;
};

type Offer = ComparisonCandidate & { id: string; productId: string | null };

// One item whose comparison rows we want.
type RivalSource = {
  key: string;
  // The offer the rows are computed for (excluded from its own rivals), if any.
  offerId: string | null;
  productId: string | null;
  productName: string;
  supermarket: string;
  chainItemcode: string | null;
  discountedPrice: number | null;
  barcode: string | null;
};

type Snap = ShelfSnapshotInput & { productId: string; chainItemcode?: string | null };

async function loadRivals(prisma: ListPricesReader, sources: RivalSource[], now: Date) {
  const links = await loadLinksFor(prisma, sources.map((s) => ({ chain: s.supermarket, code: s.chainItemcode })));
  const linkedOf = new Map(sources.map((s) => [
    s.key,
    linkedItems(links, { chain: s.supermarket, code: s.chainItemcode }).filter((l) => l.chain !== s.supermarket),
  ]));
  const linkedRefs = [...new Map([...linkedOf.values()].flat().map((r) => [itemKey(r), r])).values()];
  const pids = [...new Set(sources.map((s) => s.productId).filter((p): p is string => !!p))];

  // Live, publicly visible offers on the items' products and linked items.
  const candidates: Offer[] = pids.length + linkedRefs.length === 0 ? [] : await prisma.discount.findMany({
    where: withPublicDealVisibility({
      isActive: true,
      validUntil: { gt: now },
      OR: [
        ...(pids.length > 0 ? [{ productId: { in: pids } }] : []),
        ...linkedRefs.map((r) => ({ supermarket: r.chain, chainItemcode: r.code })),
      ],
    }),
    select: { id: true, productId: true, productName: true, supermarket: true, chainItemcode: true, discountedPrice: true },
  });
  const byPid = new Map<string, Offer[]>();
  const byItem = new Map<string, Offer[]>();
  for (const c of candidates) {
    if (c.productId) byPid.set(c.productId, [...(byPid.get(c.productId) ?? []), c]);
    if (c.chainItemcode && c.supermarket) {
      const k = itemKey({ chain: c.supermarket, code: c.chainItemcode });
      byItem.set(k, [...(byItem.get(k) ?? []), c]);
    }
  }
  const clusterOf = (s: RivalSource) => (s.productId ? byPid.get(s.productId) ?? [] : []).filter((o) => o.id !== s.offerId);
  const linkedOffersOf = (s: RivalSource) =>
    (linkedOf.get(s.key) ?? []).flatMap((l) => byItem.get(itemKey(l)) ?? []).filter((o) => o.id !== s.offerId);

  // Regular shelf prices: the barcode clusters, each linked item's product AT
  // ITS OWN CHAIN (via the chain's mapping), and the sources' own products.
  const mappings: { productId: string; supermarket: string; chainItemcode: string }[] = linkedRefs.length === 0 ? [] :
    await prisma.chainProductMapping.findMany({
      where: { OR: linkedRefs.map((r) => ({ supermarket: r.chain, chainItemcode: r.code })) },
      select: { productId: true, supermarket: true, chainItemcode: true },
    });
  const productOfItem = new Map(mappings.map((m) => [itemKey({ chain: m.supermarket, code: m.chainItemcode }), m.productId]));
  const snapPids = [...new Set([...pids, ...productOfItem.values()])];
  const since = new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000);
  const [freshChains, snaps, verdictOf] = await Promise.all([
    loadFreshShelfChains(prisma, now),
    snapPids.length === 0 ? Promise.resolve([]) : prisma.priceSnapshot.findMany({
      where: { productId: { in: snapPids }, kind: 'normal', recordedAt: { gte: since } },
      select: { productId: true, supermarket: true, price: true, recordedAt: true, chainItemcode: true },
    }),
    loadVerdictLookup(prisma, sources.flatMap((s) => {
      const side = { chain: s.supermarket, code: s.chainItemcode, name: s.productName };
      return [...clusterOf(s), ...linkedOffersOf(s)].map((o) =>
        pairKeyOf(side, { chain: o.supermarket, code: o.chainItemcode, name: o.productName }));
    })),
  ]);
  const snapsOf = new Map<string, Snap[]>();
  for (const sn of snaps as Snap[]) snapsOf.set(sn.productId, [...(snapsOf.get(sn.productId) ?? []), sn]);
  const linkedSnapsOf = (l: ItemRef) => {
    const pid = productOfItem.get(itemKey(l));
    return pid ? (snapsOf.get(pid) ?? []).filter((sn) => sn.supermarket === l.chain) : [];
  };

  const rivals = new Map<string, RivalRow[]>();
  for (const s of sources) {
    rivals.set(s.key, comparisonRivals({
      source: s,
      clusterOffers: clusterOf(s),
      // The sheet asks "barcode-backed" of the source product (lockstep).
      barcodeBacked: Boolean(s.barcode),
      snapshots: s.productId ? snapsOf.get(s.productId) ?? [] : [],
      freshChains,
      verdictOf,
      linkedOffers: linkedOffersOf(s),
      linkedSnapshots: (linkedOf.get(s.key) ?? []).flatMap(linkedSnapsOf),
      now,
    }));
  }
  return { rivals, freshChains, snapsOf };
}

const toChainPrices = (rows: RivalRow[]) => rows
  .filter((r) => r.price != null && Number.isFinite(r.price))
  .map((r) => ({ chain: r.supermarket, price: r.price as number, kind: r.rowType, offerId: r.offerId ?? null }));

export async function loadListPrices(
  prisma: ListPricesReader,
  ids: string[],
  now: Date = new Date(),
): Promise<Record<string, ItemPrices>> {
  if (ids.length === 0) return {};
  const offers: (Offer & { isActive: boolean; validUntil: Date; product: { barcode: string | null } | null })[] =
    await prisma.discount.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, productId: true, productName: true, supermarket: true, chainItemcode: true,
        discountedPrice: true, isActive: true, validUntil: true, product: { select: { barcode: true } },
      },
    });
  if (offers.length === 0) return {};
  const { rivals } = await loadRivals(prisma, offers.map((o) => ({
    key: o.id,
    offerId: o.id,
    productId: o.productId,
    productName: o.productName,
    supermarket: o.supermarket as string,
    chainItemcode: o.chainItemcode ?? null,
    discountedPrice: o.discountedPrice ?? null,
    barcode: o.product?.barcode ?? null,
  })), now);

  const out: Record<string, ItemPrices> = {};
  for (const o of offers) {
    out[o.id] = {
      chain: o.supermarket,
      price: Number(o.discountedPrice),
      live: o.isActive && new Date(o.validUntil).getTime() > now.getTime(),
      elsewhere: toChainPrices(rivals.get(o.id) ?? []),
    };
  }
  return out;
}

export type ItemPricesNow = {
  chain: string;
  code: string;
  name: string;
  productId: string;
  // Every price we can prove for this product right now: the item's own live
  // offers and its store's regular price, then the other stores' rows.
  points: PricePoint[];
};

/**
 * Prices for store items, on offer or not (keyed `${chain}#${code}`). The
 * item's name is the store's own (item_name) when known, else its product's.
 * Unknown items (no mapping) are absent.
 */
export async function loadItemPrices(
  prisma: ListPricesReader,
  items: { chain: string; code: string }[],
  now: Date = new Date(),
): Promise<Record<string, ItemPricesNow>> {
  if (items.length === 0) return {};
  const maps: { supermarket: string; chainItemcode: string; productId: string; itemName: string | null; product: { name: string; barcode: string | null } }[] =
    await prisma.chainProductMapping.findMany({
      where: { OR: items.map((i) => ({ supermarket: i.chain, chainItemcode: i.code })) },
      select: { supermarket: true, chainItemcode: true, productId: true, itemName: true, product: { select: { name: true, barcode: true } } },
    });
  if (maps.length === 0) return {};
  const ownOffers = await prisma.discount.findMany({
    where: withPublicDealVisibility({
      isActive: true,
      validUntil: { gt: now },
      OR: maps.map((m) => ({ supermarket: m.supermarket, chainItemcode: m.chainItemcode })),
    }),
    select: { id: true, supermarket: true, chainItemcode: true, discountedPrice: true, productName: true },
  }) as { id: string; supermarket: string; chainItemcode: string; discountedPrice: number; productName: string }[];
  // The store's own wording drives the sheet's pack/name guards, so it must
  // be the same words the product page uses: the store's item name, else its
  // live offer's name, else (last resort) the product's.
  const offerName = new Map(ownOffers.map((o) => [itemKey({ chain: o.supermarket, code: o.chainItemcode }), o.productName]));
  const sources: RivalSource[] = maps.map((m) => ({
    key: itemKey({ chain: m.supermarket, code: m.chainItemcode }),
    offerId: null,
    productId: m.productId,
    productName: m.itemName || offerName.get(itemKey({ chain: m.supermarket, code: m.chainItemcode })) || m.product.name,
    supermarket: m.supermarket,
    chainItemcode: m.chainItemcode,
    discountedPrice: null,
    barcode: m.product.barcode,
  }));
  const { rivals, freshChains, snapsOf } = await loadRivals(prisma, sources, now);

  const out: Record<string, ItemPricesNow> = {};
  for (const s of sources) {
    const own: PricePoint[] = ownOffers
      .filter((o) => o.supermarket === s.supermarket && o.chainItemcode === s.chainItemcode)
      .map((o) => ({ chain: o.supermarket, price: Number(o.discountedPrice), kind: 'offer' as const, offerId: o.id }));
    // The item's own regular price: its own SKU's snapshots at its own store,
    // under the same freshness gate as every shelf row (lib/feed-freshness).
    const ownSnaps = (snapsOf.get(s.productId as string) ?? [])
      .filter((sn) => sn.supermarket === s.supermarket && (!sn.chainItemcode || sn.chainItemcode === s.chainItemcode));
    const shelf = pickShelfRows({ snapshots: ownSnaps, excludedChains: [], freshChains: freshChains as FreshChains, now })[0];
    if (shelf) own.push({ chain: s.supermarket, price: shelf.price, kind: 'shelf' });
    out[s.key] = {
      chain: s.supermarket,
      code: s.chainItemcode as string,
      name: s.productName,
      productId: s.productId as string,
      points: [...own, ...toChainPrices(rivals.get(s.key) ?? [])],
    };
  }
  return out;
}
