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
      // with a separator no search term can contain, then one
      // unaccent(lower()) and one LIKE ANY over the spellings (themselves
      // normalised once, in the ARRAY subquery). The earlier form ran
      // unaccent() on three columns for every spelling — 116–329 ms in
      // Postgres depending on how many spellings a word has; this is ~100 ms
      // flat and returns the same ids (compared on 11 queries, 2026-11-16).
      // The remaining cost is that one pass over the live rows; a trigram index
      // (src/scripts/enable-pg-trgm.mjs, production DDL) would remove it.
      //
      // translate(…,'ς','σ') folds the Greek final sigma so SQL agrees with
      // normalizeSearchText — Postgres lower('Σ')='σ' but user-typed «καφές»
      // keeps «ς», and JS-expanded terms are always «σ».
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
          AND translate(unaccent(lower(product_name || ' ¦ ' || COALESCE(description, '') || ' ¦ ' || COALESCE(category, ''))), 'ς', 'σ')
              LIKE ANY (ARRAY(SELECT unaccent(lower(t)) FROM unnest(${patterns}::text[]) AS t))
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
