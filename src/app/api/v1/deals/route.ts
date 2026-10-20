// GET /api/v1/deals — one ranked page of active offers.
//
//   ?limit=24 (1–60) &offset=0 &chain=ab &category=<id>[,<id>…] &sort=hot
//
// Pages come back in database rank. Like the website (DealsClient), the APP
// de-duplicates and spreads its accumulated list with the shared libs
// (dedupe-deals, interleave-deals, deal-family): those reorder across pages,
// so doing it per page on the server would let rows repeat or vanish.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getActiveDeals } from '@/actions/get-active-deals';
import { toDealCard } from '@/lib/api/deal-card';
import { ok, fail, param } from '@/lib/api/respond';

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(24),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
  chain: z.string().regex(/^[a-z]{2,20}$/).optional(),
  category: z.string().max(400).optional(),
  sort: z.enum(['hot', 'expiring', 'discount', 'newest', 'price_asc', 'price_desc']).default('hot'),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    limit: param(url, 'limit'),
    offset: param(url, 'offset'),
    chain: param(url, 'chain'),
    category: param(url, 'category'),
    sort: param(url, 'sort'),
  });
  if (!parsed.success) return fail(400, 'invalid query');
  const q = parsed.data;
  const categories = q.category ? q.category.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8) : [];

  try {
    const { deals, total } = await getActiveDeals(
      q.limit,
      q.offset,
      q.chain ?? 'all',
      categories.length === 0 ? 'all' : categories.length === 1 ? categories[0] : categories,
      q.sort,
    );
    const next = q.offset + deals.length;
    return ok({
      deals: deals.map(toDealCard),
      total,
      nextOffset: deals.length === q.limit && next < total ? next : null,
    });
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'deals unavailable');
  }
}
