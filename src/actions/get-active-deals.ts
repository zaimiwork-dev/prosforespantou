'use server';

import prisma from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

const getDefaultDeals = unstable_cache(
  async (limit: number) => {
    const now = new Date();
    const where = {
      isActive: true,
      validUntil: { gt: now }
    };

    const [deals, total] = await Promise.all([
      prisma.discount.findMany({
        where,
        include: { store: true, leaflet: true, product: true },
        // Default sort = fylladio-style hotness (KVI/brand/mechanic + clicks +
        // recency). validUntil breaks ties. See src/lib/hotness.ts.
        orderBy: [{ hotScore: 'desc' }, { validUntil: 'asc' }],
        take: limit
      }),
      prisma.discount.count({ where }),
    ]);
    return { deals, total };
  },
  ['deals:default'],
  { tags: ['deals:default'], revalidate: 300 }
);

import * as Sentry from "@sentry/nextjs";

/**
 * Fetches active discounts from the database with filtering and pagination.
 */
type SortBy = 'hot' | 'expiring' | 'discount' | 'newest' | 'price_asc' | 'price_desc';

const orderByFor = (sortBy: SortBy): any => {
  if (sortBy === 'discount') return [{ discountPercent: { sort: 'desc', nulls: 'last' } }, { validUntil: 'asc' }];
  if (sortBy === 'newest') return { createdAt: 'desc' };
  if (sortBy === 'expiring') return { validUntil: 'asc' };
  if (sortBy === 'price_asc') return [{ discountedPrice: 'asc' }, { validUntil: 'asc' }];
  if (sortBy === 'price_desc') return [{ discountedPrice: 'desc' }, { validUntil: 'asc' }];
  // 'hot' (default): merchandising rank, validUntil breaks ties.
  return [{ hotScore: 'desc' }, { validUntil: 'asc' }];
};

export async function getActiveDeals(
  limit = 20,
  offset = 0,
  supermarketId = 'all',
  category = 'all',
  sortBy: SortBy = 'hot',
  preferredSMs?: string[]
) {
  return await Sentry.withServerActionInstrumentation('getActiveDeals', { recordResponse: true }, async () => {
    try {
      if (supermarketId === 'all' && category === 'all' && offset === 0 && sortBy === 'hot' && (!preferredSMs || preferredSMs.length === 0)) {
        return await getDefaultDeals(limit);
      }

      const now = new Date();
      const where: any = {
        isActive: true,
        validUntil: { gt: now },
      };

      if (supermarketId !== 'all') {
        where.supermarket = supermarketId;
      } else if (preferredSMs && preferredSMs.length > 0) {
        where.supermarket = { in: preferredSMs };
      }
      
      if (category !== 'all') where.category = category;

      const [deals, total] = await Promise.all([
        prisma.discount.findMany({
          where,
          include: { store: true, leaflet: true, product: true },
          orderBy: orderByFor(sortBy),
          take: limit,
          skip: offset,
        }),
        prisma.discount.count({ where })
      ]);

      return { deals, total };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error fetching active deals:', error);
      throw new Error('Failed to fetch active deals');
    }
  });
}

const PER_CHAIN_CAP = 2;

const getTopDealsCached = unstable_cache(
  async (limit: number) => {
    const now = new Date();
    const featured = await prisma.discount.findMany({
      where: {
        isActive: true,
        isFeatured: true,
        OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }],
        validUntil: { gt: now },
      },
      include: { store: true, leaflet: true, product: true },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    // Pool ranked by hotScore (KVI/brand/mechanic + clicks + recency), not raw
    // %. This frees the widget from the ~5% of deals that carry a discountPercent
    // (previously Kritikos+AB only) so all chains can surface here.
    const pool = await prisma.discount.findMany({
      where: {
        isActive: true,
        validUntil: { gt: now },
        id: { notIn: featured.map(f => f.id) },
      },
      include: { store: true, leaflet: true, product: true },
      orderBy: [{ hotScore: 'desc' }, { validUntil: 'asc' }],
      take: 80,
    });

    const need = limit - featured.length;
    const perChain = new Map<string, number>();
    const picked: typeof pool = [];
    for (const d of pool) {
      if (picked.length >= need) break;
      const used = perChain.get(d.supermarket) || 0;
      if (used >= PER_CHAIN_CAP) continue;
      perChain.set(d.supermarket, used + 1);
      picked.push(d);
    }
    if (picked.length < need) {
      const fill = pool.filter((d) => !picked.includes(d)).slice(0, need - picked.length);
      picked.push(...fill);
    }
    return [...featured, ...picked];
  },
  ['deals:top'],
  { tags: ['deals:default'], revalidate: 300 }
);

export async function getTopDeals(limit = 10) {
  try {
    return await getTopDealsCached(limit);
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}

const getEndingSoonCached = unstable_cache(
  async (limit: number) => {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000); // Expanded to 7 days so our new data shows

    const featured = await prisma.discount.findMany({
      where: {
        isActive: true,
        isFeatured: true,
        OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }],
        validUntil: { gt: now },
      },
      include: { store: true, leaflet: true, product: true },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    const deals = await prisma.discount.findMany({
      where: {
        isActive: true,
        validUntil: { gt: now, lte: in7Days },
        id: { notIn: featured.map(f => f.id) }
      },
      include: { store: true, leaflet: true, product: true },
      orderBy: { validUntil: 'asc' },
      take: limit - featured.length,
    });
    return [...featured, ...deals];
  },
  ['deals:ending-soon'],
  { tags: ['deals:default'], revalidate: 300 }
);

export async function getEndingSoonDeals(limit = 10) {
  try {
    return await getEndingSoonCached(limit);
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}
