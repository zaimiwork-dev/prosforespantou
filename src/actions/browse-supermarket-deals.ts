'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { activePublicDealWhere } from '@/lib/public-deal-filters';
import {
  supermarketBrowseCandidateCategories,
  supermarketBrowsePathMatches,
} from '@/lib/supermarket-category-browser';

const InputSchema = z.object({
  supermarket: z.string().min(1).max(40),
  topKey: z.enum(['food', 'drinks', 'personal', 'home', 'baby', 'pets', 'other']),
  groupKey: z.string().min(1).max(50),
  leafKey: z.string().min(1).max(50).nullable().optional(),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(60).optional().default(48),
});

export async function browseSupermarketDeals(rawInput: unknown) {
  return await Sentry.withServerActionInstrumentation('browseSupermarketDeals', { recordResponse: true }, async () => {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) return { deals: [], total: 0 };

    const { supermarket, topKey, groupKey, leafKey, offset, limit } = parsed.data;
    const now = new Date();
    const where: Prisma.DiscountWhereInput = {
      AND: [
        activePublicDealWhere(now, { supermarket }),
        { category: { in: supermarketBrowseCandidateCategories(topKey) } },
      ],
    };

    try {
      // Filter the small identity/taxonomy projection first, then load full card
      // data only for the requested page. This keeps category browsing accurate
      // across the whole chain without shipping thousands of offers to mobile.
      const candidates = await prisma.discount.findMany({
        where,
        // Biggest provable discount first, cheapest among equals — category
        // browsing must read as an ordered shelf, not hotScore jitter.
        orderBy: [
          { discountPercent: { sort: 'desc', nulls: 'last' } },
          { discountedPrice: 'asc' },
        ],
        select: {
          id: true,
          category: true,
          subcategory: true,
          productName: true,
        },
      });
      const selected = candidates.filter((deal) => supermarketBrowsePathMatches(deal, {
        topKey,
        groupKey,
        leafKey: leafKey || null,
      }));
      const pageIds = selected.slice(offset, offset + limit).map((deal) => deal.id);
      if (pageIds.length === 0) return { deals: [], total: selected.length };

      const rows = await prisma.discount.findMany({
        where: { id: { in: pageIds } },
        include: { store: true, leaflet: true, product: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const deals = pageIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((deal) => ({
          ...deal,
          validFrom: deal!.validFrom?.toISOString?.() ?? deal!.validFrom,
          validUntil: deal!.validUntil?.toISOString?.() ?? deal!.validUntil,
          createdAt: deal!.createdAt?.toISOString?.() ?? deal!.createdAt,
          updatedAt: deal!.updatedAt?.toISOString?.() ?? deal!.updatedAt,
        }));

      return { deals, total: selected.length };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error browsing supermarket category:', error);
      return { deals: [], total: 0 };
    }
  });
}
