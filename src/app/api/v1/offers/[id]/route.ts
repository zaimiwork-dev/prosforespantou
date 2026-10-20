// GET /api/v1/offers/:id — the product page: the offer, the same item at
// other chains (offers and «Κανονική τιμή» shelf rows), this chain's 90-day
// price history, and similar offers. Same calls as src/app/offer/[id].
//
// Like the website, an offer that has ended still answers (shared links,
// saved lists) — but with `active: false`, so the app can say «Έληξε»
// instead of showing an old price as if it were current.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma';
import { getPriceComparison } from '@/actions/get-price-comparison';
import { getPriceHistory } from '@/actions/get-price-history';
import { getSimilarOffers } from '@/actions/get-similar-offers';
import { SUPERMARKETS } from '@/lib/constants';
import { toDealCard } from '@/lib/api/deal-card';
import { ok, fail } from '@/lib/api/respond';

const Id = z.string().uuid();

const getOffer = (id: string) =>
  unstable_cache(
    () => prisma.discount.findUnique({ where: { id }, include: { store: true, leaflet: true, product: true } }),
    [`api:offer:${id}`],
    { tags: [`offer:${id}`, 'deals:default'], revalidate: 300 },
  )();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return fail(400, 'invalid id');

  try {
    const offer = await getOffer(id);
    if (!offer) return fail(404, 'offer not found');

    const [comparison, history, similar] = await Promise.all([
      getPriceComparison(id),
      getPriceHistory(offer.productId, {
        days: 90,
        supermarket: offer.supermarket,
        currentPrice: Number(offer.discountedPrice),
      }),
      getSimilarOffers(id),
    ]);

    const now = Date.now();
    const chain = SUPERMARKETS.find((s) => s.id === offer.supermarket);
    return ok({
      offer: {
        ...toDealCard(offer),
        description: offer.description ?? null,
        active: offer.isActive && new Date(offer.validUntil).getTime() > now,
        leafletUrl: chain?.leafletUrl ?? null,
      },
      // Offer rows become cards; shelf rows stay a plain chain + price, the
      // «Κανονική τιμή» line the website draws for chains with no offer.
      comparison: (comparison as Array<Record<string, any>>).map((r) =>
        r.rowType === 'shelf'
          ? { type: 'shelf', chain: r.supermarket, price: r.price, recordedAt: r.recordedAt, checkedAt: r.checkedAt }
          : { type: 'offer', deal: toDealCard(r as never) },
      ),
      history,
      similar: (similar as never[]).map(toDealCard),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error(`[api/v1] offer unavailable:`, error);
    return fail(500, 'offer unavailable');
  }
}
