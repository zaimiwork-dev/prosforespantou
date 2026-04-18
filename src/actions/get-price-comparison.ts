'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';

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
          take: 8,
        });

        return others.map((d) => ({
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
