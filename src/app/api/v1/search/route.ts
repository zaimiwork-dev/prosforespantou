// GET /api/v1/search?q=γάλα[&chain=ab] — the website's search (searchDeals:
// accent/ς-insensitive matching, synonym expansion, search-rank ordering),
// up to 60 cards. Searches hit the database, so this one is rate-limited.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { searchDeals } from '@/actions/search-deals';
import { toDealCard } from '@/lib/api/deal-card';
import { ok, fail, param, rateLimited, timed } from '@/lib/api/respond';

const Query = z.object({
  q: z.string().min(2).max(80),
  chain: z.string().regex(/^[a-z]{2,20}$/).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({ q: param(url, 'q'), chain: param(url, 'chain') });
  if (!parsed.success) return fail(400, 'invalid query');
  if (rateLimited(req, 'search')) return fail(429, 'too many searches');

  try {
    const t0 = performance.now();
    const rows = await searchDeals(parsed.data.q, parsed.data.chain);
    const t1 = performance.now();
    const body = { query: parsed.data.q, deals: rows.map(toDealCard) };
    return timed(ok(body), { db: t1 - t0, cards: performance.now() - t1 });
  } catch (error) {
    Sentry.captureException(error);
    console.error(`[api/v1] search unavailable:`, error);
    return fail(500, 'search unavailable');
  }
}
