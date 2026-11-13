'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { buildPriceTimeline, selectTimelineSnapshots, type PriceTimeline } from '@/lib/price-timeline';
import { loadFreshShelfChains } from '@/lib/feed-freshness';


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
  reliable: false,
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
    // The on-screen offer's chain SKU: lets the history be that SKU's own (SRV-02).
    chainItemcode?: string | null;
  }
): Promise<PriceTimeline> {
  return await Sentry.withServerActionInstrumentation(
    'getPriceTimeline',
    { recordResponse: false },
    async () => {
      try {
        if (!productId || !options.supermarket) return EMPTY;
        const since = new Date(Date.now() - TIMELINE_DAYS * 86400000);

        const [rows, freshChains, skus] = await Promise.all([
          prisma.priceSnapshot.findMany({
            where: { productId, supermarket: options.supermarket, recordedAt: { gte: since } },
            orderBy: { recordedAt: 'asc' },
            select: { price: true, kind: true, recordedAt: true, lastSeenAt: true, chainItemcode: true },
          }),
          loadFreshShelfChains(prisma),
          // Snapshots are keyed by product, not by chain SKU: with two SKUs of
          // this chain on one product the series mixes packs (lib/price-timeline).
          prisma.chainProductMapping.count({ where: { productId, supermarket: options.supermarket } }),
        ]);

        const picked = selectTimelineSnapshots({
          rows, offerItemcode: options.chainItemcode, mappingCount: skus,
        });

        return buildPriceTimeline({
          snapshots: picked.rows.map((r) => ({
            price: r.price, kind: r.kind, recordedAt: r.recordedAt,
            lastSeenAt: r.lastSeenAt, chainItemcode: r.chainItemcode,
          })),
          offer: options.offer ?? null,
          shelfFeedAliveAt: freshChains.get(options.supermarket) ?? null,
          // A per-SKU series is one pack by construction.
          mixedSkus: !picked.perSku && skus > 1,
        });
      } catch (error) {
        Sentry.captureException(error);
        return EMPTY;
      }
    }
  );
}
