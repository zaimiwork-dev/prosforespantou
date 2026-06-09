'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { computeVerdict } from '@/lib/price-verdict';

export interface PricePoint {
  recordedAt: string;
  price: number;
  supermarket: string;
}

export interface PriceHistory {
  points: PricePoint[];
  // Summary stats over the requested window.
  min: number | null;
  max: number | null;
  avg: number | null;
  current: number | null;
  // "Actually cheap?" verdict:
  //   'lowest' = matches or beats the window minimum
  //   'good'   = within ~5% of minimum
  //   'fair'   = below window average but not great
  //   'meh'    = at or above the window average
  //   'high'   = noticeably above average (warn the user)
  verdict: 'lowest' | 'good' | 'fair' | 'meh' | 'high' | null;
  // Percent above the window min (0 when at min). Useful for "↓ X% below average".
  percentAboveMin: number | null;
  daysCovered: number;
}

const FALLBACK: PriceHistory = {
  points: [],
  min: null,
  max: null,
  avg: null,
  current: null,
  verdict: null,
  percentAboveMin: null,
  daysCovered: 0,
};

// Fetch price history for one canonical product. `days` defaults to 90 — we
// have a month of data today; queries will gracefully shorten to that.
// Pass supermarket=null/undefined to get cross-chain history (preferred — more
// data points). Pass a slug to scope to one chain.
export async function getPriceHistory(
  productId: string | null | undefined,
  options: { days?: number; supermarket?: string | null; currentPrice?: number | null } = {}
): Promise<PriceHistory> {
  return await Sentry.withServerActionInstrumentation(
    'getPriceHistory',
    { recordResponse: false },
    async () => {
      try {
        if (!productId) return FALLBACK;
        const days = options.days ?? 90;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const rows = await prisma.priceSnapshot.findMany({
          where: {
            productId,
            recordedAt: { gte: since },
            ...(options.supermarket ? { supermarket: options.supermarket } : {}),
          },
          orderBy: { recordedAt: 'asc' },
          select: { recordedAt: true, price: true, supermarket: true },
        });

        if (rows.length === 0) return FALLBACK;

        const prices = rows.map((r) => r.price);

        // The verdict must judge the price the shopper actually sees. Prefer the
        // explicit offer price; fall back to the latest snapshot only when the
        // caller doesn't pass one. (Judging the last snapshot of a cross-chain
        // series is what produced false "lowest price" badges — see lib/price-verdict.)
        const current = options.currentPrice ?? prices[prices.length - 1];
        const v = computeVerdict(current, prices);

        return {
          points: rows.map((r) => ({
            recordedAt: r.recordedAt.toISOString(),
            price: r.price,
            supermarket: r.supermarket,
          })),
          min: v.min,
          max: v.max,
          avg: v.avg,
          current,
          verdict: v.verdict,
          percentAboveMin: v.percentAboveMin,
          daysCovered: days,
        };
      } catch (error) {
        Sentry.captureException(error);
        return FALLBACK;
      }
    }
  );
}
