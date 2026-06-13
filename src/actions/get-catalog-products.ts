'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

// Browse the FULL catalog (every Product we hold), not just offers. Current
// offers rank first; non-offer products remain available for deeper browsing /
// search but stay price-silent. This is the resilience payoff: the catalog + its
// self-hosted images live in our DB, so it browses even when a chain blocks us.

const InputSchema = z.object({
  search: z.string().max(120).optional().default(''),
  limit: z.number().int().min(1).max(48).optional().default(24),
  offset: z.number().int().min(0).optional().default(0),
  // 'withImage' (default) hides the long tail of image-less catalog rows so the
  // grid looks like a real store; 'all' shows everything.
  scope: z.enum(['withImage', 'all']).optional().default('withImage'),
});

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string | null;
  unitInfo: string | null;
  imageUrl: string | null;
  offer: null | {
    id: string;
    supermarket: string | null;
    discountedPrice: number;
    originalPrice: number | null;
    category: string;
    description: string | null;
    priceVerdict: string | null;
    offerType: string | null;
  };
};

function compactWhere(parts: any[]) {
  return parts.length ? { AND: parts } : {};
}

export async function getCatalogProducts(rawInput: unknown): Promise<{ products: CatalogProduct[]; total: number }> {
  return await Sentry.withServerActionInstrumentation('getCatalogProducts', { recordResponse: true }, async () => {
    const parsed = InputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) return { products: [], total: 0 };
    const { search, limit, offset, scope } = parsed.data;
    const now = new Date();

    const baseParts: any[] = [];
    if (scope === 'withImage') baseParts.push({ imageUrl: { not: null } });
    const q = search.trim();
    if (q) {
      baseParts.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q } },
        ],
      });
    }

    try {
      const currentOfferWhere = { isActive: true, validUntil: { gt: now } };
      const baseWhere = compactWhere(baseParts);
      const withOfferWhere = compactWhere([...baseParts, { discounts: { some: currentOfferWhere } }]);
      const withoutOfferWhere = compactWhere([...baseParts, { NOT: { discounts: { some: currentOfferWhere } } }]);
      const select = {
        id: true,
        name: true,
        brand: true,
        unitInfo: true,
        imageUrl: true,
        // Cheapest CURRENT offer for this product, if any — the only price we
        // promote in the catalog.
        discounts: {
          where: currentOfferWhere,
          orderBy: { discountedPrice: 'asc' as const },
          take: 1,
          select: {
            id: true,
            supermarket: true,
            discountedPrice: true,
            originalPrice: true,
            category: true,
            description: true,
            priceVerdict: true,
            offerType: true,
          },
        },
      };

      const [offerTotal, total] = await Promise.all([
        prisma.product.count({ where: withOfferWhere }),
        prisma.product.count({ where: baseWhere }),
      ]);

      const rows: any[] = [];
      if (offset < offerTotal) {
        const take = Math.min(limit, offerTotal - offset);
        rows.push(...await prisma.product.findMany({
          where: withOfferWhere,
          select,
          orderBy: { updatedAt: 'desc' },
          skip: offset,
          take,
        }));
      }

      if (rows.length < limit) {
        const nonOfferOffset = Math.max(0, offset - offerTotal);
        rows.push(...await prisma.product.findMany({
          where: withoutOfferWhere,
          select,
          orderBy: { updatedAt: 'desc' },
          skip: nonOfferOffset,
          take: limit - rows.length,
        }));
      }

      const products: CatalogProduct[] = rows.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        unitInfo: p.unitInfo,
        imageUrl: p.imageUrl,
        offer: p.discounts[0] ?? null,
      }));
      return { products, total };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error fetching catalog products:', error);
      return { products: [], total: 0 };
    }
  });
}
