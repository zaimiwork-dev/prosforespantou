// GET /api/v1/items/:chain/:code — any store item, on offer or not (owner
// 2026-11-23: «we know the price of items that are not on offer, so people
// can get alerts when their item goes on offer»). The item (store name,
// photo), every price we can prove today — its own store's offer or regular
// price, then the comparison sheet's rows at other stores (lib/list-prices
// loadItemPrices) — and its price history at its own store (lib/price-timeline).
// The «Ειδοποίησέ με» watch uses the same (chain, code).
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loadItemPrices } from '@/lib/list-prices';
import { getPriceTimeline } from '@/actions/get-price-timeline';
import { ok, fail, rateLimited, timed } from '@/lib/api/respond';

const Params = z.object({ chain: z.string().regex(/^[a-z]{2,20}$/), code: z.string().min(1).max(64) });

export async function GET(req: Request, ctx: { params: Promise<{ chain: string; code: string }> }) {
  const parsed = Params.safeParse(await ctx.params);
  if (!parsed.success) return fail(400, 'invalid item');
  if (rateLimited(req, 'items', 240)) return fail(429, 'too many requests');
  const { chain, code } = parsed.data;
  try {
    const t0 = performance.now();
    const mapping = await prisma.chainProductMapping.findUnique({
      where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: code } },
      select: { productId: true, itemName: true, product: { select: { name: true, imageUrl: true, brand: true, unitInfo: true } } },
    });
    if (!mapping) return fail(404, 'item not found');
    const [prices, timeline] = await Promise.all([
      loadItemPrices(prisma as never, [{ chain, code }]),
      getPriceTimeline(mapping.productId, { supermarket: chain, chainItemcode: code }),
    ]);
    const now = prices[`${chain}#${code}`];
    return timed(ok({
      item: {
        chain,
        code,
        name: now?.name ?? mapping.itemName ?? mapping.product.name,
        imageUrl: mapping.product.imageUrl ?? null,
        brand: mapping.product.brand ?? null,
        unitInfo: mapping.product.unitInfo ?? null,
      },
      // Cheapest first; kind 'offer' rows carry the offer id to open.
      prices: (now?.points ?? []).slice().sort((a, b) => a.price - b.price),
      timeline,
    }), { db: performance.now() - t0 });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[api/v1] item unavailable:', error);
    return fail(500, 'item unavailable');
  }
}
