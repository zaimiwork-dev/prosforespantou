'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { expandSearch, scoreSearchResult, searchIntentDepartment } from '@/lib/search-rank';
import { activePublicDealWhere } from '@/lib/public-deal-filters';

// Browse the FULL catalog (every Product we hold), not just offers. Current
// offers rank first; non-offer products remain available for deeper browsing /
// search but stay price-silent. This is the resilience payoff: the catalog + its
// self-hosted images live in our DB, so it browses even when a chain blocks us.

const InputSchema = z.object({
  search: z.string().max(120).optional().default(''),
  limit: z.number().int().min(1).max(48).optional().default(24),
  offset: z.number().int().min(0).optional().default(0),
  mode: z.enum(['catalog', 'offers']).optional().default('catalog'),
  // 'withImage' (default) hides the long tail of image-less catalog rows so the
  // grid looks like a real store; 'all' shows everything.
  scope: z.enum(['withImage', 'all']).optional().default('withImage'),
  category: z.string().max(80).optional().default('all'),
  supermarket: z.string().max(40).optional().default('all'),
});

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string | null;
  unitInfo: string | null;
  imageUrl: string | null;
  supermarket: string | null;
  offer: null | {
    id: string;
    supermarket: string | null;
    discountedPrice: number;
    originalPrice: number | null;
    category: string;
    description: string | null;
    priceVerdict: string | null;
    offerType: string | null;
    productName: string;
    imageUrl: string | null;
    validFrom: Date | string | null;
    validUntil: Date | string | null;
    datesFromSource?: boolean;
    updatedAt?: Date | string | null;
    discountPercent: number | null;
    hotScore?: number | null;
    productId: string | null;
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
    supermarket: p.supermarket,
    offer: p.discounts[0] ?? null,
  }));
}

export async function getCatalogProducts(rawInput: unknown): Promise<{ products: CatalogProduct[]; total: number }> {
  return await Sentry.withServerActionInstrumentation('getCatalogProducts', { recordResponse: true }, async () => {
    const parsed = InputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) return { products: [], total: 0 };
    const { search, limit, offset, mode, scope, category, supermarket } = parsed.data;
    const now = new Date();

    const q = search.trim();
    const baseParts: any[] = [];
    if (scope === 'withImage') baseParts.push({ imageUrl: { not: null } });
    if (mode === 'catalog' && supermarket && supermarket !== 'all') {
      baseParts.push({ supermarket });
    }
    const currentOfferWhere: any = activePublicDealWhere(now);
    if (mode === 'offers' && category && category !== 'all') currentOfferWhere.category = category;
    if (supermarket && supermarket !== 'all') currentOfferWhere.supermarket = supermarket;
    const filteredToOffers = mode === 'offers';

    try {
      const select = {
        id: true,
        name: true,
        brand: true,
        unitInfo: true,
        imageUrl: true,
        supermarket: true,
        updatedAt: true,
        // Cheapest CURRENT offer for this product, if any — the only price we
        // promote in the catalog.
        discounts: {
          where: currentOfferWhere,
          orderBy: [{ hotScore: 'desc' as const }, { discountedPrice: 'asc' as const }],
          take: 1,
          select: {
            id: true,
            supermarket: true,
            productName: true,
            discountedPrice: true,
            originalPrice: true,
            discountPercent: true,
            category: true,
            description: true,
            priceVerdict: true,
            offerType: true,
            imageUrl: true,
            validFrom: true,
            validUntil: true,
            // The catalog's ProductSheet feeds this trimmed object straight
            // into OfferDetails — without these two the honest-dates UI would
            // treat every catalog-opened offer as fabricated-date.
            datesFromSource: true,
            updatedAt: true,
            hotScore: true,
            productId: true,
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
        const productSupermarketClause = mode === 'catalog' && supermarket && supermarket !== 'all'
          ? Prisma.sql`AND p.supermarket = ${supermarket}`
          : Prisma.empty;
        const candidateLimit = Math.min(Math.max(offset + limit + 500, 700), 1800);
        const idRows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT p.id
          FROM products p
          WHERE 1 = 1
            ${imageClause}
            ${productSupermarketClause}
            AND (${Prisma.join(conditions, ' OR ')})
          ORDER BY p.updated_at DESC
          LIMIT ${candidateLimit}
        `;

        if (idRows.length === 0) return { products: [], total: 0 };

        const rows = await prisma.product.findMany({
          where: {
            id: { in: idRows.map((r) => r.id) },
            ...(filteredToOffers ? { discounts: { some: currentOfferWhere } } : {}),
          },
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
      if (!filteredToOffers) {
        const [rows, total] = await Promise.all([
          prisma.product.findMany({
            where: baseWhere,
            select,
            orderBy: { updatedAt: 'desc' },
            skip: offset,
            take: limit,
          }),
          prisma.product.count({ where: baseWhere }),
        ]);
        return { products: mapRows(rows), total };
      }

      const withOfferWhere = compactWhere([...baseParts, { discounts: { some: currentOfferWhere } }]);
      const offerTotal = await prisma.product.count({ where: withOfferWhere });
      const rows: any[] = [];
      if (offset < offerTotal) {
        const take = Math.min(offset + limit, offerTotal);
        const offerRows = await prisma.product.findMany({
          where: withOfferWhere,
          select,
          orderBy: { updatedAt: 'desc' },
          take,
        });
        offerRows.sort((a: any, b: any) => {
          const ah = a.discounts[0]?.hotScore ?? 0;
          const bh = b.discounts[0]?.hotScore ?? 0;
          if (bh !== ah) return bh - ah;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        rows.push(...offerRows.slice(offset, offset + limit));
      }
      return { products: mapRows(rows), total: offerTotal };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error fetching catalog products:', error);
      return { products: [], total: 0 };
    }
  });
}

export async function getCatalogFacets(): Promise<{
  offerTotal: number;
  catalogTotal: number;
  bySupermarket: Record<string, number>;
  offerBySupermarket: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  return await Sentry.withServerActionInstrumentation('getCatalogFacets', { recordResponse: true }, async () => {
    const now = new Date();
    const where = activePublicDealWhere(now);
    try {
      const [offerTotal, catalogTotal, bySm, byCat] = await Promise.all([
        prisma.discount.count({ where }),
        prisma.product.count({ where: { imageUrl: { not: null } } }),
        prisma.product.groupBy({ by: ['supermarket'], where: { imageUrl: { not: null } }, _count: { _all: true } }),
        prisma.discount.groupBy({ by: ['category'], where, _count: { _all: true } }),
      ]);
      const bySupermarket: Record<string, number> = {};
      for (const r of bySm) if (r.supermarket) bySupermarket[r.supermarket] = r._count._all;
      const byOfferSm = await prisma.discount.groupBy({ by: ['supermarket'], where, _count: { _all: true } });
      const offerBySupermarket: Record<string, number> = {};
      for (const r of byOfferSm) if (r.supermarket) offerBySupermarket[r.supermarket] = r._count._all;
      const byCategory: Record<string, number> = {};
      for (const r of byCat) if (r.category) byCategory[r.category] = r._count._all;
      return { offerTotal, catalogTotal, bySupermarket, offerBySupermarket, byCategory };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error fetching catalog facets:', error);
      return { offerTotal: 0, catalogTotal: 0, bySupermarket: {}, offerBySupermarket: {}, byCategory: {} };
    }
  });
}
