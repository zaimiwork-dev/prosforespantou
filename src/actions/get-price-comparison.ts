'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { samePack } from '@/lib/packaging';
import { filterComparable } from '@/lib/offer-similarity';

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
          where: {
            productId: { in: [...matchedProductIds] },
            isActive: true,
            validUntil: { gt: now },
            NOT: { id: discountId },
          },
          include: { store: true, product: true },
          orderBy: { discountedPrice: 'asc' },
          take: 16,
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

        return comparable.map((d) => ({
          ...d,
          validFrom: d.validFrom.toISOString(),
          validUntil: d.validUntil.toISOString(),
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        }));
      } catch (error) {
        Sentry.captureException(error);
        console.error('Error fetching price comparison:', error);
        return [];
      }
    }
  );
}
