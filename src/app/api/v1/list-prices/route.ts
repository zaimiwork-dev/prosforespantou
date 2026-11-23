// GET /api/v1/list-prices?ids=<uuid>,<uuid>,… — for each offer on the app's
// shopping list: its chain, current price, whether it is still on, and its
// price at the other chains (the rows its comparison sheet shows: offers and
// «Κανονική τιμή» shelf prices). The app turns this into «σε ποιο κατάστημα
// βγαίνει φθηνότερα η λίστα» with the shared lib/list-basket, as the website
// does. Unknown ids are simply absent from `items`.
//
// Cached at the edge like the other read endpoints (5 min): the app sends the
// ids sorted, so the same list asks the same URL.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loadListPrices } from '@/lib/list-prices';
import { ok, fail, param, rateLimited, timed } from '@/lib/api/respond';

const Ids = z.array(z.string().uuid()).min(1).max(100);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Ids.safeParse((param(url, 'ids') ?? '').split(',').filter(Boolean));
  if (!parsed.success) return fail(400, 'invalid ids');
  if (rateLimited(req, 'list-prices')) return fail(429, 'too many requests');

  try {
    const t0 = performance.now();
    const items = await loadListPrices(prisma, [...new Set(parsed.data)]);
    return timed(ok({ items }), { db: performance.now() - t0 });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[api/v1] list-prices unavailable:', error);
    return fail(500, 'list prices unavailable');
  }
}
