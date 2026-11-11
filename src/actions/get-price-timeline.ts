'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { buildPriceTimeline, type PriceTimeline } from '@/lib/price-timeline';
import { loadFreshShelfChains } from '@/lib/feed-freshness';

export type { PriceTimeline };

// How far back to read. Snapshots go back to April 2026 (~220 days today);
// 400 days leaves room for a year of history without an unbounded scan.
const TIMELINE_DAYS = 400;

const EMPTY: PriceTimeline = {
  since: null,
  daysTracked: 0,
  shelf: [],
  promos: [],
  stats: {
    shelfNow: null,
    shelfFirst: null,
    shelfChangePct: null,
    shelfChanges: 0,
    lowest: null,
    highest: null,
    promoCount: 0,
    currentPrice: null,
    currentIsLowest: false,
    suspect: false,
  },
  quality: 'none',
};

// Truthful price timeline for one canonical product AT ONE CHAIN (SRV-01):
// shelf steps from `normal` snapshots, promos as points, the whole history we
// hold. Pure logic lives in lib/price-timeline; this only loads and calls it.
// Never throws: a failure answers the empty timeline (quality 'none').
export async function getPriceTimeline(
  productId: string | null | undefined,
  options: {
    supermarket: string | null | undefined;
    // The offer on screen. firstSeenAt is the best "since when" we have for it.
    offer?: { price: number; firstSeenAt: string | Date; active: boolean } | null;
  }
): Promise<PriceTimeline> {
  return await Sentry.withServerActionInstrumentation(
    'getPriceTimeline',
    { recordResponse: false },
    async () => {
      try {
        if (!productId || !options.supermarket) return EMPTY;
        const since = new Date(Date.now() - TIMELINE_DAYS * 86400000);

        const [rows, freshChains] = await Promise.all([
          prisma.priceSnapshot.findMany({
            where: { productId, supermarket: options.supermarket, recordedAt: { gte: since } },
            orderBy: { recordedAt: 'asc' },
            // LASTSEEN: once PriceSnapshot gets a `lastSeenAt` column, add
            // `lastSeenAt: true` here and `lastSeenAt: r.lastSeenAt` below -
            // nothing else changes (the library already honours it).
            select: { price: true, kind: true, recordedAt: true },
          }),
          loadFreshShelfChains(prisma),
        ]);

        return buildPriceTimeline({
          snapshots: rows.map((r) => ({ price: r.price, kind: r.kind, recordedAt: r.recordedAt })),
          offer: options.offer ?? null,
          shelfFeedAliveAt: freshChains.get(options.supermarket) ?? null,
        });
      } catch (error) {
        Sentry.captureException(error);
        return EMPTY;
      }
    }
  );
}
