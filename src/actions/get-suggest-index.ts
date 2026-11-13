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
// the BUILT index (a few thousand phrases, ~200 KB), not the rows: a keystroke
// never reaches the database. Same lifetime and tag as the listing pools, so a
// revalidateTag('deals:default') after an import refreshes suggestions too.
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

export async function getSuggestIndex(): Promise<SuggestIndex> {
  return await Sentry.withServerActionInstrumentation('getSuggestIndex', { recordResponse: false }, async () => loadIndex());
}
