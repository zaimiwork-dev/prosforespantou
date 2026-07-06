'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { samePack } from '@/lib/packaging';
import { filterComparable } from '@/lib/offer-similarity';
import { withPublicDealVisibility } from '@/lib/public-deal-filters';
import { pickShelfRows, SHELF_PRICE_MAX_AGE_DAYS } from '@/lib/shelf-comparison';

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
            product: { select: { barcode: true } },
          },
        });

        if (!source) return [];

        const productId = source.productId;
        const barcode = source.product?.barcode ?? null;

        if (!productId && !barcode) return [];

        const matchedProductIds = new Set<string>();
        if (productId) matchedProductIds.add(productId);

        if (barcode) {
          const sameBarcode = await prisma.product.findMany({
            where: { barcode },
            select: { id: true },
          });
          for (const p of sameBarcode) matchedProductIds.add(p.id);
        }

        if (matchedProductIds.size === 0) return [];

        const now = new Date();
        const others = await prisma.discount.findMany({
          where: withPublicDealVisibility({
            productId: { in: [...matchedProductIds] },
            isActive: true,
            validUntil: { gt: now },
            NOT: { id: discountId },
          }),
          include: { store: true, product: true },
          orderBy: { discountedPrice: 'asc' },
        });

        // Only compare like-for-like pack sizes. A 12-pack offer sharing a
        // canonical product with single units must not be priced against them.
        const sameSize = others.filter((d) => samePack(source.productName, d.productName));

        // Mis-mapped productIds (several chain SKUs on one canonical product)
        // would otherwise render DIFFERENT products as "the same item elsewhere"
        // — see lib/offer-similarity. Guard on actual name similarity.
        const comparable = filterComparable(
          source.productName,
          sameSize,
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
        // this product. Barcode-gated: snapshots carry no chain-side name, so
        // the variant/pack guards can't vet them — only the GTIN-verified
        // cluster is safe (mapping-only clusters are exactly where the stale
        // mis-mappings live; the Groq mapping audit is still deferred).
        // Chains that appeared in `others` are excluded even if their offer was
        // dropped by a guard above — the snapshot shares the same mapping risk.
        if (!barcode) return offerRows;

        const excludedChains = new Set<string>();
        if (source.supermarket) excludedChains.add(source.supermarket);
        for (const d of others) if (d.supermarket) excludedChains.add(d.supermarket);

        const snapshots = await prisma.priceSnapshot.findMany({
          where: {
            productId: { in: [...matchedProductIds] },
            kind: 'normal',
            recordedAt: { gte: new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000) },
            supermarket: { notIn: [...excludedChains] },
          },
          orderBy: { recordedAt: 'desc' },
          take: 100,
          select: { supermarket: true, price: true, recordedAt: true },
        });

        const shelfRows = pickShelfRows({ snapshots, excludedChains, now });
        return [...offerRows, ...shelfRows];
      } catch (error) {
        Sentry.captureException(error);
        console.error('Error fetching price comparison:', error);
        return [];
      }
    }
  );
}
