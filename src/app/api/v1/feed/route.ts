// GET /api/v1/feed[?chains=ab,lidl][&cats=<dept>,<dept>] — the app's home as
// an ordered list of rails, so a shopper finds offers by scrolling:
//
//   { total, sections: [{ id, title, subtitle, seeAll, deals: DealCard[] }] }
//
// Titles, order and which rails exist are decided HERE, not in the app: an
// installed app cannot be forced to update, so a rail can be added, renamed or
// dropped on the server and every phone shows it on its next open. The app
// draws any section it is given; `seeAll` holds /api/v1/deals parameters for
// its «Όλες» link (null = no link).
//
// `chains` are the shopper's stores, `cats` the departments their own phone
// has seen them look at most (lib/interest in the app, kept on the device and
// only with consent). Nothing about the shopper is stored by this endpoint.
// Rules for each rail: lib/feed-sections + actions/get-feed.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getFeed } from '@/actions/get-feed';
import { toDealCard } from '@/lib/api/deal-card';
import { ok, fail, param } from '@/lib/api/respond';

const Query = z.object({
  chains: z.string().regex(/^[a-z]{2,20}(,[a-z]{2,20}){0,9}$/).optional(),
  cats: z.string().max(400).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({ chains: param(url, 'chains'), cats: param(url, 'cats') });
  if (!parsed.success) return fail(400, 'invalid query');

  try {
    const { total, sections } = await getFeed({
      chains: parsed.data.chains?.split(','),
      interests: parsed.data.cats?.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4),
    });
    if (sections.length === 0) return fail(500, 'feed unavailable');
    return ok({
      total,
      sections: sections.map(({ rows, ...s }) => ({ ...s, deals: rows.map((r) => toDealCard(r as never)) })),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error(`[api/v1] feed unavailable:`, error);
    return fail(500, 'feed unavailable');
  }
}
