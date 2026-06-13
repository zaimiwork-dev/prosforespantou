'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { expandSearch, scoreSearchResult, searchIntentDepartment } from '@/lib/search-rank';

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

function mapRows(rows: any[]): CatalogProduct[] {
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    unitInfo: p.unitInfo,
    imageUrl: p.imageUrl,
    offer: p.discounts[0] ?? null,
  }));
}

export async function getCatalogProducts(rawInput: unknown): Promise<{ products: CatalogProduct[]; total: number }> {
  return await Sentry.withServerActionInstrumentation('getCatalogProducts', { recordResponse: true }, async () => {
    const parsed = InputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) return { products: [], total: 0 };
    const { search, limit, offset, scope } = parsed.data;
    const now = new Date();

    const q = search.trim();
    const baseParts: any[] = [];
    if (scope === 'withImage') baseParts.push({ imageUrl: { not: null } });

    try {
      const currentOfferWhere = { isActive: true, validUntil: { gt: now } };
      const select = {
        id: true,
        name: true,
        brand: true,
        unitInfo: true,
        imageUrl: true,
        updatedAt: true,
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
            hotScore: true,
          },
        },
      };

      if (q) {
        const terms = expandSearch(q).slice(0, 12);
        const conditions = terms.map((term) => Prisma.sql`
          (unaccent(lower(p.name)) LIKE unaccent(lower(${'%' + term + '%'}))
          OR unaccent(lower(COALESCE(p.brand, ''))) LIKE unaccent(lower(${'%' + term + '%'}))
          OR COALESCE(p.barcode, '') LIKE ${'%' + term + '%'})
        `);
        if (conditions.length === 0) return { products: [], total: 0 };

        const imageClause = scope === 'withImage'
          ? Prisma.sql`AND p.image_url IS NOT NULL`
          : Prisma.empty;
        const candidateLimit = Math.min(Math.max(offset + limit + 500, 700), 1800);
        const idRows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT p.id
          FROM products p
          WHERE 1 = 1
            ${imageClause}
            AND (${Prisma.join(conditions, ' OR ')})
          ORDER BY p.updated_at DESC
          LIMIT ${candidateLimit}
        `;

        if (idRows.length === 0) return { products: [], total: 0 };

        const rows = await prisma.product.findMany({
          where: { id: { in: idRows.map((r) => r.id) } },
          select,
        });
        const intentDept = searchIntentDepartment(q, terms);
        const scored = rows
          .map((p: any) => {
            const offer = p.discounts[0] ?? null;
            const score = scoreSearchResult(
              q,
              {
                productName: p.name,
                description: [p.brand, p.unitInfo, offer?.description].filter(Boolean).join(' '),
                category: offer?.category ?? null,
                hotScore: offer?.hotScore ?? 0,
              },
              terms,
              intentDept
            );
            return { p, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => {
            const aOffer = a.p.discounts.length > 0;
            const bOffer = b.p.discounts.length > 0;
            if (aOffer !== bOffer) return aOffer ? -1 : 1;
            if (b.score !== a.score) return b.score - a.score;
            return new Date(b.p.updatedAt).getTime() - new Date(a.p.updatedAt).getTime();
          });

        const page = scored.slice(offset, offset + limit).map((x) => x.p);
        return { products: mapRows(page), total: scored.length };
      }

      const baseWhere = compactWhere(baseParts);
      const withOfferWhere = compactWhere([...baseParts, { discounts: { some: currentOfferWhere } }]);
      const withoutOfferWhere = compactWhere([...baseParts, { NOT: { discounts: { some: currentOfferWhere } } }]);

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

      return { products: mapRows(rows), total };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error fetching catalog products:', error);
      return { products: [], total: 0 };
    }
  });
}
