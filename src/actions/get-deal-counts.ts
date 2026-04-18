'use server';

import prisma from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import * as Sentry from '@sentry/nextjs';

const getCountsCached = unstable_cache(
  async () => {
    const now = new Date();
    const where = { isActive: true, validUntil: { gt: now } };

    const [bySm, byCat, total] = await Promise.all([
      prisma.discount.groupBy({
        by: ['supermarket'],
        where,
        _count: { _all: true },
      }),
      prisma.discount.groupBy({
        by: ['category'],
        where,
        _count: { _all: true },
      }),
      prisma.discount.count({ where }),
    ]);

    const bySupermarket: Record<string, number> = {};
    for (const r of bySm) if (r.supermarket) bySupermarket[r.supermarket] = r._count._all;

    const byCategory: Record<string, number> = {};
    for (const r of byCat) if (r.category) byCategory[r.category] = r._count._all;

    return { bySupermarket, byCategory, total };
  },
  ['deals:counts'],
  { tags: ['deals:default'], revalidate: 300 }
);

export async function getDealCounts() {
  try {
    return await getCountsCached();
  } catch (error) {
    Sentry.captureException(error);
    return { bySupermarket: {}, byCategory: {}, total: 0 };
  }
}
