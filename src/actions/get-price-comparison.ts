'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { samePack } from '@/lib/packaging';
import { filterComparable } from '@/lib/offer-similarity';
import { filterByVerdict, loadVerdictLookup, pairKeyOf } from '@/lib/comparison-verdict';
import { linkedItems, loadLinksFor } from '@/lib/item-links';
import { withPublicDealVisibility } from '@/lib/public-deal-filters';
import { pickShelfRows, SHELF_PRICE_MAX_AGE_DAYS } from '@/lib/shelf-comparison';
import { loadFreshShelfChains } from '@/lib/feed-freshness';

export async function getPriceComparison(discountId: string) {
  return await Sentry.withServerActionInstrumentation(
    'getPriceComparison',
    { recordResponse: true },
    async () => {
      try {
        const source = await prisma.discount.findUnique({
          where: { id: discountId },
          select: {
            id: true,
            productId: true,
            productName: true,
            supermarket: true,
            chainItemcode: true,
            product: { select: { barcode: true } },
          },
        });

        if (!source) return [];

        const productId = source.productId;
        const barcode = source.product?.barcode ?? null;

        // Cross-chain item links (lib/item-links, 2026-11-22): items at other
        // chains confirmed to be this same product (barcode, AI check once per
        // pair of item codes, or the owner), though they sit on another
        // product record because each chain named it differently.
        const links = await loadLinksFor(prisma, [{ chain: source.supermarket, code: source.chainItemcode }]);
        const linked = linkedItems(links, { chain: source.supermarket, code: source.chainItemcode })
          .filter((l) => l.chain !== source.supermarket);

        if (!productId && !barcode && linked.length === 0) return [];

        const matchedProductIds = new Set<string>();
        if (productId) matchedProductIds.add(productId);

        if (barcode) {
          const sameBarcode = await prisma.product.findMany({
            where: { barcode },
            select: { id: true },
          });
          for (const p of sameBarcode) matchedProductIds.add(p.id);
        }

        const now = new Date();
        const live = { isActive: true, validUntil: { gt: now }, NOT: { id: discountId } };
        const [clusterOffers, linkedOffers] = await Promise.all([
          matchedProductIds.size > 0
            ? prisma.discount.findMany({
              where: withPublicDealVisibility({ ...live, productId: { in: [...matchedProductIds] } }),
              include: { store: true, product: true },
              orderBy: { discountedPrice: 'asc' },
            })
            : Promise.resolve([]),
          linked.length > 0
            ? prisma.discount.findMany({
              where: withPublicDealVisibility({ ...live, OR: linked.map((l) => ({ supermarket: l.chain, chainItemcode: l.code })) }),
              include: { store: true, product: true },
              orderBy: { discountedPrice: 'asc' },
            })
            : Promise.resolve([]),
        ]);
        const seen = new Set<string>();
        const others = [...clusterOffers, ...linkedOffers]
          .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
          .sort((a, b) => a.discountedPrice - b.discountedPrice);

        // Only OTHER chains, and only like-for-like pack sizes. A row from the
        // shopper's own chain is never a comparison (2026-11-22): its web +
        // leaflet twin adds nothing, and a second SKU there is unverified — an
        // AB «Ψωμί Τοστ Ολικής Άλεσης 720g» at 1,63 € was shown as
        // «ΦΘΗΝΟΤΕΡΑ» on another AB «Ψωμί Τοστ Ολικής Άλεσης 720g» at 1,93 €
        // (AB names carry no brand). A 12-pack sharing a canonical product
        // with single units must not be priced against them either.
        const sameSize = others.filter((d) =>
          d.supermarket !== source.supermarket && samePack(source.productName, d.productName));

        // AI verdicts (lib/comparison-verdict, owner decision 2026-11-22): a
        // pair the nightly check judged different or unsure is never shown.
        // Before filterComparable, so a hidden row cannot take its chain's slot.
        // KEEP IN LOCKSTEP with lib/comparison-count comparisonRivals.
        // Keyed by each chain's own item code (its «slot»), so a renamed
        // listing keeps its verdict. A linked offer passes on its own link row.
        const sourceSide = { chain: source.supermarket, code: source.chainItemcode, name: source.productName };
        const sideOf = (d: (typeof sameSize)[number]) => ({ chain: d.supermarket, code: d.chainItemcode, name: d.productName });
        const verdictOf = await loadVerdictLookup(prisma, sameSize.map((d) => pairKeyOf(sourceSide, sideOf(d))));
        const vetted = filterByVerdict(sourceSide, sameSize, sideOf, verdictOf);

        // Mis-mapped productIds (several chain SKUs on one canonical product)
        // would otherwise render DIFFERENT products as "the same item elsewhere"
        // — see lib/offer-similarity. Guard on actual name similarity.
        const comparable = filterComparable(
          source.productName,
          vetted,
          (d) => d.productName,
          (d) => d.supermarket
        ).slice(0, 8);

        const offerRows = comparable.map((d) => ({
          ...d,
          rowType: 'offer' as const,
          validFrom: d.validFrom.toISOString(),
          validUntil: d.validUntil.toISOString(),
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        }));

        // Shelf-price rows («Κανονική τιμή») for chains with NO active offer on
        // this product, from two trusted sources:
        //   - the barcode cluster (GTIN-verified products), as before;
        //   - each LINKED item's own chain (the link is a checked same-item
        //     verdict on the two chain names) — only that chain's snapshots of
        //     the linked product, never its other chains (those are not links).
        // Chains that appeared in `others` are excluded even if their offer was
        // dropped by a guard above — the snapshot shares the same mapping risk.
        const linkedMappings = linked.length > 0
          ? await prisma.chainProductMapping.findMany({
            where: { OR: linked.map((l) => ({ supermarket: l.chain, chainItemcode: l.code })) },
            select: { productId: true, supermarket: true },
          })
          : [];
        if (!barcode && linkedMappings.length === 0) return offerRows;

        const excludedChains = new Set<string>();
        if (source.supermarket) excludedChains.add(source.supermarket);
        for (const d of others) if (d.supermarket) excludedChains.add(d.supermarket);

        // Gate = the chain's catalog feed is alive (lib/feed-freshness), NOT
        // snapshot age — shelf snapshots are written only on price change, so
        // a stable price has no recent row. SHELF_PRICE_MAX_AGE_DAYS is only
        // a sanity cap here. No `take`: on-change snapshots are few per chain.
        const since = new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000);
        const select = { supermarket: true, price: true, recordedAt: true };
        const [freshChains, clusterSnaps, linkedSnaps] = await Promise.all([
          loadFreshShelfChains(prisma, now),
          barcode
            ? prisma.priceSnapshot.findMany({
              where: { productId: { in: [...matchedProductIds] }, kind: 'normal', recordedAt: { gte: since }, supermarket: { notIn: [...excludedChains] } },
              orderBy: { recordedAt: 'desc' },
              select,
            })
            : Promise.resolve([]),
          linkedMappings.length > 0
            ? prisma.priceSnapshot.findMany({
              where: { OR: linkedMappings.map((m) => ({ productId: m.productId, supermarket: m.supermarket })), kind: 'normal', recordedAt: { gte: since } },
              orderBy: { recordedAt: 'desc' },
              select,
            })
            : Promise.resolve([]),
        ]);

        const shelfRows = pickShelfRows({ snapshots: [...clusterSnaps, ...linkedSnaps], excludedChains, freshChains, now });
        return [...offerRows, ...shelfRows];
      } catch (error) {
        Sentry.captureException(error);
        console.error('Error fetching price comparison:', error);
        return [];
      }
    }
  );
}
