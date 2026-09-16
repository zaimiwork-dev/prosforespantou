'use server';

import prisma from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import { dedupeDeals } from '@/lib/dedupe-deals';
import { capPerFamily } from '@/lib/deal-family';
import { activePublicDealWhere, withPublicDealVisibility } from '@/lib/public-deal-filters';
import { ESSENTIALS, pickEssentials } from '@/lib/weekly-essentials';

const getDefaultDeals = unstable_cache(
  async (limit: number) => {
    const now = new Date();
    const where = activePublicDealWhere(now);

    const [deals, total] = await Promise.all([
      prisma.discount.findMany({
        where,
        include: { store: true, leaflet: true, product: true },
        // Default sort = fylladio-style hotness (KVI/brand/mechanic + clicks +
        // verdict + recency). id last = fully deterministic pagination.
        orderBy: [{ hotScore: 'desc' }, { validUntil: 'asc' }, { id: 'asc' }],
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

// Every sort ends on { id } so equal-key rows keep a stable order across
// requests and pagination pages (Postgres otherwise returns ties arbitrarily).
const orderByFor = (sortBy: SortBy): any => {
  if (sortBy === 'discount') return [{ discountPercent: { sort: 'desc', nulls: 'last' } }, { validUntil: 'asc' }, { id: 'asc' }];
  if (sortBy === 'newest') return [{ createdAt: 'desc' }, { id: 'asc' }];
  if (sortBy === 'expiring') return [{ validUntil: 'asc' }, { id: 'asc' }];
  if (sortBy === 'price_asc') return [{ discountedPrice: 'asc' }, { validUntil: 'asc' }, { id: 'asc' }];
  if (sortBy === 'price_desc') return [{ discountedPrice: 'desc' }, { validUntil: 'asc' }, { id: 'asc' }];
  // 'hot' (default): merchandising rank.
  return [{ hotScore: 'desc' }, { validUntil: 'asc' }, { id: 'asc' }];
};

export async function getActiveDeals(
  limit = 20,
  offset = 0,
  supermarketId = 'all',
  // One department, or several (the personalized "Για σένα" rail asks for the
  // user's declared + learned categories in a single query).
  category: string | string[] = 'all',
  sortBy: SortBy = 'hot',
  preferredSMs?: string[]
) {
  return await Sentry.withServerActionInstrumentation('getActiveDeals', { recordResponse: true }, async () => {
    try {
      if (supermarketId === 'all' && category === 'all' && offset === 0 && sortBy === 'hot' && (!preferredSMs || preferredSMs.length === 0)) {
        return await getDefaultDeals(limit);
      }

      const now = new Date();
      const where: any = activePublicDealWhere(now);

      if (supermarketId !== 'all') {
        where.supermarket = supermarketId;
      } else if (preferredSMs && preferredSMs.length > 0) {
        where.supermarket = { in: preferredSMs };
      }

      if (Array.isArray(category)) {
        if (category.length > 0) where.category = { in: category.slice(0, 8) };
      } else if (category !== 'all') {
        where.category = category;
      }

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

// ── «Για σένα» pools (W4b, 2026-09-16) ──────────────────────────────────────
// The rail ranks in the browser (lib/personal-feed), but the POOLS it ranks
// are not personal: they are "the hottest offers in these departments", and
// optionally "…at these chains". Shoppers share departments, so caching the
// pools turns a per-visit query into a per-five-minutes one, while the
// ranking stays per-device. Keys are sorted so {γάλα, καφές} and
// {καφές, γάλα} are one entry.
const getPersonalPoolCached = unstable_cache(
  async (catsKey: string, storesKey: string, limit: number) => {
    const now = new Date();
    const where: any = activePublicDealWhere(now);
    const cats = catsKey ? catsKey.split('\u0000') : [];
    if (cats.length > 0) where.category = { in: cats };
    const stores = storesKey ? storesKey.split('\u0000') : [];
    if (stores.length > 0) where.supermarket = { in: stores };

    const deals = await prisma.discount.findMany({
      where,
      include: { store: true, leaflet: true, product: true },
      orderBy: orderByFor('hot'),
      take: limit,
    });
    return { deals, total: deals.length };
  },
  ['deals:personal-pool'],
  { tags: ['deals:default'], revalidate: 300 }
);

/**
 * Hot offers inside a set of departments, optionally narrowed to a set of
 * chains. Cached per (departments, chains) — see the note above.
 */
export async function getPersonalPool(
  categories: string[],
  supermarkets: string[] = [],
  limit = 30
) {
  return await Sentry.withServerActionInstrumentation('getPersonalPool', { recordResponse: false }, async () => {
    try {
      const cats = [...new Set(categories.filter(Boolean))].sort().slice(0, 8);
      const stores = [...new Set(supermarkets.filter(Boolean))].sort().slice(0, 10);
      const capped = Math.min(Math.max(1, limit), 60);
      return await getPersonalPoolCached(cats.join('\u0000'), stores.join('\u0000'), capped);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error fetching personal pool:', error);
      return { deals: [], total: 0 };
    }
  });
}

// Chain diversity for the homepage rail — sized for the 20-item two-row
// carousel (cap 3 × ~7 chains ≈ 20; the fill loop covers any shortfall).
const PER_CHAIN_CAP = 3;

const getTopDealsCached = unstable_cache(
  async (limit: number) => {
    const now = new Date();
    const featured = await prisma.discount.findMany({
      where: withPublicDealVisibility({
        isActive: true,
        isFeatured: true,
        OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }],
        validUntil: { gt: now },
      }),
      include: { store: true, leaflet: true, product: true },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    // Pool ranked by hotScore (KVI/brand/mechanic + clicks + recency), not raw
    // %. This frees the widget from the ~5% of deals that carry a discountPercent
    // (previously Kritikos+AB only) so all chains can surface here.
    const pool = await prisma.discount.findMany({
      where: withPublicDealVisibility({
        isActive: true,
        validUntil: { gt: now },
        id: { notIn: featured.map(f => f.id) },
      }),
      include: { store: true, leaflet: true, product: true },
      orderBy: [{ hotScore: 'desc' }, { validUntil: 'asc' }, { id: 'asc' }],
      take: 80,
    });

    // For every pooled product, also fetch its rows at OTHER chains — a
    // cheaper chain's row for the identical item often ranks far below the
    // pool's hotScore floor (no % badge → less boost), and the cross-chain
    // collapse can only pick a cheaper sibling it can see.
    const pids = Array.from(
      new Set(pool.map((d) => d.productId).filter((x): x is string => !!x))
    );
    const siblings = pids.length
      ? await prisma.discount.findMany({
          where: withPublicDealVisibility({
            isActive: true,
            validUntil: { gt: now },
            productId: { in: pids },
            id: { notIn: [...featured.map((f) => f.id), ...pool.map((p) => p.id)] },
          }),
          include: { store: true, leaflet: true, product: true },
        })
      : [];

    // Same product can hold one row per source (web+leaflet), and catalog
    // dupes can hold the same name under two productIds — show one card.
    // Stable partition: offers with >24h of life lead; a carousel headlining
    // "Λήγει σήμερα" sells urgency but dies on the user the same evening.
    // Siblings append AFTER the pool so slot positions follow hotScore rank.
    const dayAway = now.getTime() + 24 * 3600_000;
    // Family cap (lib/deal-family): one Έλμα gum, one Coca-Cola pack — a
    // 20-slot showcase must show breadth, not three sizes of one thing.
    const deduped = capPerFamily(dedupeDeals([...pool, ...siblings], { crossChain: true }));
    const ordered = [
      ...deduped.filter((d) => d.validUntil.getTime() > dayAway),
      ...deduped.filter((d) => d.validUntil.getTime() <= dayAway),
    ];

    const need = limit - featured.length;
    const perChain = new Map<string, number>();
    const picked: typeof ordered = [];
    for (const d of ordered) {
      if (picked.length >= need) break;
      const used = perChain.get(d.supermarket) || 0;
      if (used >= PER_CHAIN_CAP) continue;
      perChain.set(d.supermarket, used + 1);
      picked.push(d);
    }
    if (picked.length < need) {
      const fill = ordered.filter((d) => !picked.includes(d)).slice(0, need - picked.length);
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
      where: withPublicDealVisibility({
        isActive: true,
        isFeatured: true,
        OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }],
        validUntil: { gt: now },
      }),
      include: { store: true, leaflet: true, product: true },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    const deals = await prisma.discount.findMany({
      where: withPublicDealVisibility({
        isActive: true,
        validUntil: { gt: now, lte: in7Days },
        id: { notIn: featured.map(f => f.id) }
      }),
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

// «Τα βασικά της εβδομάδας» (lib/weekly-essentials): the cheapest active offer
// per staple, per kilo/litre/piece, across ALL chains — it is a comparison
// rail, so it deliberately ignores «Τα καταστήματά μου» (a Lidl-only shopper
// still wants to know milk is cheaper elsewhere this week).
// Reads only the staple departments (~7k rows, 5 columns) and matches names in
// JS: Postgres ILIKE is accent-sensitive (γάλα ≠ γαλα), the regexes are not.
const ESSENTIAL_DEPARTMENTS = Array.from(new Set(ESSENTIALS.flatMap((e) => e.departments)));

const getWeeklyEssentialsCached = unstable_cache(
  async () => {
    const now = new Date();
    const rows = await prisma.discount.findMany({
      where: activePublicDealWhere(now, { category: { in: ESSENTIAL_DEPARTMENTS } }),
      select: { id: true, productName: true, category: true, discountedPrice: true, supermarket: true },
    });
    const picks = pickEssentials(rows);
    if (picks.length === 0) return [];

    const full = await prisma.discount.findMany({
      where: { id: { in: picks.map((p) => p.deal.id) } },
      include: { store: true, leaflet: true, product: true },
    });
    const byId = new Map(full.map((d) => [d.id, d]));
    return picks.flatMap((p) => {
      const d = byId.get(p.deal.id);
      if (!d) return [];
      return [{ ...d, essential: { id: p.id, label: p.label, chainCount: p.chainCount } }];
    });
  },
  ['deals:essentials'],
  { tags: ['deals:default'], revalidate: 300 }
);

export async function getWeeklyEssentials() {
  try {
    return await getWeeklyEssentialsCached();
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}
