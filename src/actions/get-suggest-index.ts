'use server';

import prisma from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { activePublicDealWhere } from '@/lib/public-deal-filters';
import { buildSuggestIndex, type SuggestIndex } from '@/lib/suggest';
import { CATEGORIES } from '@/lib/constants';

// Department id → the short label the app and the site print on chips.
const LABELS: Record<string, string> = Object.fromEntries(
  (CATEGORIES as { id: string; label: string }[]).map((c) => [c.id, c.label]),
);

// Only two columns of the active public offers are read, and what is cached is
// the BUILT index (a few thousand phrases, ~165 KB), not the rows. Same
// lifetime and tag as the listing pools, so a revalidateTag('deals:default')
// after an import refreshes suggestions too.
const loadIndex = unstable_cache(
  async (): Promise<SuggestIndex> => {
    const rows = await prisma.discount.findMany({
      where: activePublicDealWhere(new Date()),
      select: { productName: true, category: true },
    });
    return buildSuggestIndex(rows, LABELS);
  },
  ['suggest-index'],
  { tags: ['deals:default'], revalidate: 300 },
);

// One built index per warm server instance, in front of unstable_cache.
//
// Why: measured in production on 2026-11-15 (the route's Server-Timing header),
// EVERY call spent 700–900 ms in loadIndex — the entry is first computed inside
// a route handler and was never found again on the next call, so each keystroke
// re-read 13k rows — while the match itself takes 7–10 ms. A shopper's
// keystrokes arrive a second apart on the same instance: with this, the first
// one may pay for a build and the rest cost nothing. It also keeps the index
// the same object between calls, which is what suggest()'s normalised-terms
// memo is keyed on.
//
// Freshness is unchanged (5 minutes, the listing caches' lifetime); a tag
// revalidation reaches a warm instance when its copy expires.
const TTL_MS = 300_000;
let warm: { at: number; index: SuggestIndex } | null = null;
// Concurrent first calls share one build instead of each running the query.
let building: Promise<SuggestIndex> | null = null;

async function build(): Promise<SuggestIndex> {
  const index = await Sentry.withServerActionInstrumentation('getSuggestIndex', { recordResponse: false }, async () => loadIndex());
  warm = { at: Date.now(), index };
  return index;
}

export async function getSuggestIndex(): Promise<SuggestIndex> {
  if (warm && Date.now() - warm.at < TTL_MS) return warm.index;
  building ??= build().finally(() => {
    building = null;
  });
  return building;
}
