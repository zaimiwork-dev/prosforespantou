'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';

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
  options: { days?: number; supermarket?: string | null } = {}
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
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
        const current = prices[prices.length - 1];

        // Verdict — compare current to window min/avg. Tolerances tuned to be
        // honest: "lowest" only when truly at min, "high" when clearly above.
        const epsilon = 0.01;
        const overMin = current - min;
        const overMinPct = min > 0 ? (overMin / min) * 100 : 0;

        let verdict: PriceHistory['verdict'];
        if (overMin <= epsilon) verdict = 'lowest';
        else if (overMinPct <= 5) verdict = 'good';
        else if (current < avg) verdict = 'fair';
        else if (current <= avg + epsilon) verdict = 'meh';
        else verdict = 'high';

        return {
          points: rows.map((r) => ({
            recordedAt: r.recordedAt.toISOString(),
            price: r.price,
            supermarket: r.supermarket,
          })),
          min,
          max,
          avg: Math.round(avg * 100) / 100,
          current,
          verdict,
          percentAboveMin: Math.round(overMinPct * 10) / 10,
          daysCovered: days,
        };
      } catch (error) {
        Sentry.captureException(error);
        return FALLBACK;
      }
    }
  );
}
