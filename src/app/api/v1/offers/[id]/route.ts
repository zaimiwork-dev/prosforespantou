// GET /api/v1/offers/:id — the product page: the offer, the same item at
// other chains (offers and «Κανονική τιμή» shelf rows), this chain's 90-day
// price history, a full-history price `timeline` (SRV-01, added 2026-11-12:
// shelf steps + promo points, see lib/price-timeline; `history` is unchanged
// because installed apps read it and its window feeds the stored verdict),
// and similar offers. Same calls as src/app/offer/[id].
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
import { getPriceTimeline } from '@/actions/get-price-timeline';
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

    const nowMs = Date.now();
    const active = offer.isActive && new Date(offer.validUntil).getTime() > nowMs;
    const [comparison, history, timeline, similar] = await Promise.all([
      getPriceComparison(id),
      getPriceHistory(offer.productId, {
        days: 90,
        supermarket: offer.supermarket,
        currentPrice: Number(offer.discountedPrice),
      }),
      getPriceTimeline(offer.productId, {
        supermarket: offer.supermarket,
        chainItemcode: offer.chainItemcode ?? null,
        // Discount has no first-seen column. validFrom is the earliest start we
        // can stand behind (re-stamped by runs when dates are not the chain's,
        // which only understates how long the offer has run - never overstates).
        offer: { price: Number(offer.discountedPrice), firstSeenAt: offer.validFrom, active },
      }),
      getSimilarOffers(id),
    ]);

    const now = nowMs;
    const chain = SUPERMARKETS.find((s) => s.id === offer.supermarket);
    return ok({
      offer: {
        ...toDealCard(offer),
        description: offer.description ?? null,
        active,
        leafletUrl: chain?.leafletUrl ?? null,
      },
      // Offer rows become cards; shelf rows stay a plain chain + price, the
      // «Κανονική τιμή» line the website draws for chains with no offer.
      // Rows of the offer's OWN chain are dropped: a product can hold a web and
      // a leaflet offer at one chain (Discount.source), and the page then listed
      // «Μασούτης 4,84 €» twice, both «Φθηνότερα» (seen 2026-11-13). The stored
      // comparison count already ignores them (lib/comparison-count).
      comparison: (comparison as Array<Record<string, any>>)
        .filter((r) => r.rowType === 'shelf' || r.supermarket !== offer.supermarket)
        .map((r) =>
        r.rowType === 'shelf'
          ? { type: 'shelf', chain: r.supermarket, price: r.price, recordedAt: r.recordedAt, checkedAt: r.checkedAt }
          : { type: 'offer', deal: toDealCard(r as never) },
      ),
      history,
      timeline,
      similar: (similar as never[]).map(toDealCard),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error(`[api/v1] offer unavailable:`, error);
    return fail(500, 'offer unavailable');
  }
}
