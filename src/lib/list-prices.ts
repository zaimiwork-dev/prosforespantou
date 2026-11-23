// What each item on a shopping list costs at the OTHER chains — exactly the
// rows its comparison sheet shows (an offer there, or that chain's regular
// shelf price), loaded for the whole list in one batch.
//
// The rows come from comparisonRivals (lib/comparison-count), the lockstep
// twin of actions/get-price-comparison: same pack guard, AI verdicts, name
// guard, 8-row cap, links and fresh-feed shelf prices. This file only does
// the batch loading, mirroring src/scripts/recompute-comparison-counts.mjs.
// Read by lib/list-basket (the «whole list» comparison) through
// actions/get-list-prices (website) and /api/v1/list-prices (app).
import { comparisonRivals, type ComparisonCandidate } from './comparison-count';
import { itemKey, loadVerdictLookup, pairKeyOf } from './comparison-verdict';
import { linkedItems, loadLinksFor, type ItemRef } from './item-links';
import { loadFreshShelfChains } from './feed-freshness';
import { SHELF_PRICE_MAX_AGE_DAYS, type ShelfSnapshotInput } from './shelf-comparison';
import { withPublicDealVisibility } from './public-deal-filters';
import type { ItemPrices } from './list-basket';

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

export async function loadListPrices(
  prisma: ListPricesReader,
  ids: string[],
  now: Date = new Date(),
): Promise<Record<string, ItemPrices>> {
  if (ids.length === 0) return {};
  const sources: (Offer & { isActive: boolean; validUntil: Date; product: { barcode: string | null } | null })[] =
    await prisma.discount.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, productId: true, productName: true, supermarket: true, chainItemcode: true,
        discountedPrice: true, isActive: true, validUntil: true, product: { select: { barcode: true } },
      },
    });
  if (sources.length === 0) return {};

  const links = await loadLinksFor(prisma, sources.map((s) => ({ chain: s.supermarket, code: s.chainItemcode })));
  const linkedOf = new Map(sources.map((s) => [
    s.id,
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
  const clusterOf = (s: Offer) => (s.productId ? byPid.get(s.productId) ?? [] : []).filter((o) => o.id !== s.id);
  const linkedOffersOf = (s: Offer) =>
    (linkedOf.get(s.id) ?? []).flatMap((l) => byItem.get(itemKey(l)) ?? []).filter((o) => o.id !== s.id);

  // Regular shelf prices: the barcode clusters, and each linked item's product
  // AT ITS OWN CHAIN (via the chain's mapping).
  const mappings: { productId: string; supermarket: string; chainItemcode: string }[] = linkedRefs.length === 0 ? [] :
    await prisma.chainProductMapping.findMany({
      where: { OR: linkedRefs.map((r) => ({ supermarket: r.chain, chainItemcode: r.code })) },
      select: { productId: true, supermarket: true, chainItemcode: true },
    });
  const productOfItem = new Map(mappings.map((m) => [itemKey({ chain: m.supermarket, code: m.chainItemcode }), m.productId]));
  const barcodePids = sources.filter((s) => s.productId && s.product?.barcode).map((s) => s.productId as string);
  const snapPids = [...new Set([...barcodePids, ...productOfItem.values()])];
  const since = new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000);
  const [freshChains, snaps, verdictOf] = await Promise.all([
    loadFreshShelfChains(prisma, now),
    snapPids.length === 0 ? Promise.resolve([]) : prisma.priceSnapshot.findMany({
      where: { productId: { in: snapPids }, kind: 'normal', recordedAt: { gte: since } },
      select: { productId: true, supermarket: true, price: true, recordedAt: true },
    }),
    loadVerdictLookup(prisma, sources.flatMap((s) => {
      const side = { chain: s.supermarket, code: s.chainItemcode, name: s.productName };
      return [...clusterOf(s), ...linkedOffersOf(s)].map((o) =>
        pairKeyOf(side, { chain: o.supermarket, code: o.chainItemcode, name: o.productName }));
    })),
  ]);
  const snapsOf = new Map<string, (ShelfSnapshotInput & { productId: string })[]>();
  for (const sn of snaps as (ShelfSnapshotInput & { productId: string })[]) {
    snapsOf.set(sn.productId, [...(snapsOf.get(sn.productId) ?? []), sn]);
  }
  const linkedSnapsOf = (l: ItemRef) => {
    const pid = productOfItem.get(itemKey(l));
    return pid ? (snapsOf.get(pid) ?? []).filter((sn) => sn.supermarket === l.chain) : [];
  };

  const out: Record<string, ItemPrices> = {};
  for (const s of sources) {
    const rivals = comparisonRivals({
      source: s,
      clusterOffers: clusterOf(s),
      barcodeBacked: Boolean(s.product?.barcode),
      snapshots: s.productId ? snapsOf.get(s.productId) ?? [] : [],
      freshChains,
      verdictOf,
      linkedOffers: linkedOffersOf(s),
      linkedSnapshots: (linkedOf.get(s.id) ?? []).flatMap(linkedSnapsOf),
      now,
    });
    out[s.id] = {
      chain: s.supermarket,
      price: Number(s.discountedPrice),
      live: s.isActive && new Date(s.validUntil).getTime() > now.getTime(),
      elsewhere: rivals
        .filter((r) => r.price != null && Number.isFinite(r.price))
        .map((r) => ({ chain: r.supermarket, price: r.price as number, kind: r.rowType, offerId: r.offerId ?? null })),
    };
  }
  return out;
}
