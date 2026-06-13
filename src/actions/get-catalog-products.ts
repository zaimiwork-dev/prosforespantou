'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

// Browse the FULL catalog (every Product we hold), not just offers. Each product
// carries its cheapest CURRENT offer when one exists, so the UI can show an
// honest "σε προσφορά X€" badge — and stays silent (no invented price) when the
// product isn't on offer anywhere right now. This is the resilience payoff: the
// catalog + its self-hosted images live in our DB, so it browses even when a
// chain blocks our scrapers.

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
  };
};

export async function getCatalogProducts(rawInput: unknown): Promise<{ products: CatalogProduct[]; total: number }> {
  return await Sentry.withServerActionInstrumentation('getCatalogProducts', { recordResponse: true }, async () => {
    const parsed = InputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) return { products: [], total: 0 };
    const { search, limit, offset, scope } = parsed.data;
    const now = new Date();

    const where: any = {};
    if (scope === 'withImage') where.imageUrl = { not: null };
    const q = search.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q } },
      ];
    }

    try {
      const [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          select: {
            id: true,
            name: true,
            brand: true,
            unitInfo: true,
            imageUrl: true,
            // Cheapest CURRENT offer for this product, if any — the honest price.
            discounts: {
              where: { isActive: true, validUntil: { gt: now } },
              orderBy: { discountedPrice: 'asc' },
              take: 1,
              select: {
                id: true,
                supermarket: true,
                discountedPrice: true,
                originalPrice: true,
                category: true,
                description: true,
                priceVerdict: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.product.count({ where }),
      ]);

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
