'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import * as Sentry from "@sentry/nextjs";
import { expandSearch, rankSearchResults } from '@/lib/search-rank';
import { withPublicDealVisibility } from '@/lib/public-deal-filters';

export async function searchDeals(query: string, supermarket?: string) {
  return await Sentry.withServerActionInstrumentation('searchDeals', { recordResponse: true }, async () => {
    if (!query || query.trim().length < 2) return [];

    try {
      const expandedTerms = expandSearch(query);

      // Stage 1 — broad candidate recall in SQL (substring LIKE across all
      // spellings). Deliberately over-fetches and orders by hotScore: the old
      // version capped at 50 ordered by EXPIRY, so near-expiring soaps could
      // crowd actual milk out of the window before ranking ever happened.
      //
      // Each row is normalised ONCE: name, description and category joined
      // with a separator no search term can contain, one f_unaccent(lower()),
      // one LIKE ANY over the spellings. That exact expression is indexed
      // (GIN trigram `discounts_search_trgm`, src/scripts/ensure-search-index.mjs),
      // so Postgres reads only the rows that contain the word: ~100 ms → 2–15 ms
      // (2026-11-22). The expression here and in the script must stay
      // identical, or the index is silently not used. f_unaccent is an
      // IMMUTABLE wrapper of unaccent (indexes refuse STABLE functions).
      //
      // The spellings come from expandSearch(), already lower-case, without
      // accents and with «ς» as «σ» (normalizeSearchText), so they are passed
      // as they are; translate(…,'ς','σ') gives the row side the same fold —
      // Postgres lower('Σ') = 'σ' but stored names keep a final «ς».
      const patterns = expandedTerms.map((term) => `%${term}%`);
      const supermarketClause = supermarket
        ? Prisma.sql`AND supermarket = ${supermarket}`
        : Prisma.empty;
      const idLimit = supermarket ? 400 : 300;

      // Only what the ranking reads comes back here (SearchableDeal).
      const light = await prisma.$queryRaw<
        { id: string; productName: string | null; description: string | null; category: string | null; hotScore: number | null }[]
      >`
        SELECT id, product_name AS "productName", description, category, hot_score AS "hotScore"
        FROM discounts
        WHERE is_active = true
          AND valid_until > NOW()
          AND (supermarket IS DISTINCT FROM 'mymarket' OR original_price IS NOT NULL OR description IS NOT NULL)
          ${supermarketClause}
          AND translate(public.f_unaccent(lower(product_name || ' ¦ ' || COALESCE(description, '') || ' ¦ ' || COALESCE(category, ''))), 'ς', 'σ')
              LIKE ANY (${patterns}::text[])
        ORDER BY hot_score DESC, id
        LIMIT ${idLimit}
      `;

      if (light.length === 0) return [];

      // Stage 2 — relevance ranking (word match > prefix > substring, query
      // category intent, hotScore as tiebreak). See src/lib/search-rank.ts.
      // Ranked on the light rows, so the full rows (with store, leaflet and
      // product) are fetched for the 60 that are returned, not for all 300
      // candidates — that fetch was the larger half of the search time.
      const topIds = rankSearchResults(query, light).slice(0, 60).map((r) => r.id);
      if (topIds.length === 0) return [];

      const full = await prisma.discount.findMany({
        where: withPublicDealVisibility({ id: { in: topIds } }),
        include: { store: true, leaflet: true, product: true },
      });
      const byId = new Map(full.map((row) => [row.id, row]));
      return topIds.flatMap((id) => byId.get(id) ?? []);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error searching deals:', error);
      throw new Error('Failed to search deals');
    }
  });
}
