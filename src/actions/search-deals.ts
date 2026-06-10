'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import * as Sentry from "@sentry/nextjs";
import { expandSearch, rankSearchResults } from '@/lib/search-rank';

export async function searchDeals(query: string, supermarket?: string) {
  return await Sentry.withServerActionInstrumentation('searchDeals', { recordResponse: true }, async () => {
    if (!query || query.trim().length < 2) return [];

    try {
      const expandedTerms = expandSearch(query);

      // Stage 1 — broad candidate recall in SQL (substring LIKE across all
      // spellings). Deliberately over-fetches and orders by hotScore: the old
      // version capped at 50 ordered by EXPIRY, so near-expiring soaps could
      // crowd actual milk out of the window before ranking ever happened.
      // After running src/scripts/enable-pg-trgm.mjs, swap unaccent → f_unaccent
      // below so Postgres can use the GIN trigram index. Until then, queries
      // work but do a sequential scan (~10k rows, fine).
      const conditions = expandedTerms.map(term => Prisma.sql`
        (unaccent(lower(product_name)) LIKE unaccent(lower(${'%' + term + '%'}))
        OR unaccent(lower(COALESCE(description, ''))) LIKE unaccent(lower(${'%' + term + '%'}))
        OR unaccent(lower(COALESCE(category, ''))) LIKE unaccent(lower(${'%' + term + '%'})))
      `);

      const joinedConditions = Prisma.join(conditions, ' OR ');
      const supermarketClause = supermarket
        ? Prisma.sql`AND supermarket = ${supermarket}`
        : Prisma.empty;
      const idLimit = supermarket ? 400 : 300;

      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM discounts
        WHERE is_active = true
          AND valid_until > NOW()
          ${supermarketClause}
          AND (${joinedConditions})
        ORDER BY hot_score DESC
        LIMIT ${idLimit}
      `;

      if (rows.length === 0) return [];

      const candidates = await prisma.discount.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        include: { store: true, leaflet: true, product: true },
      });

      // Stage 2 — relevance ranking (word match > prefix > substring, query
      // category intent, hotScore as tiebreak). See src/lib/search-rank.ts.
      return rankSearchResults(query, candidates).slice(0, 60);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error searching deals:', error);
      throw new Error('Failed to search deals');
    }
  });
}
