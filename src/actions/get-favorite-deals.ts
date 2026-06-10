'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';

// Current offers for the user's ⭐ favourites (localStorage watchlist — no
// account needed, per the product vision). Matched products come back across
// ALL chains via productId ("my coffee is also on offer at Sklavenitis");
// unmatched favourites fall back to exact-name matching.
const inputSchema = z.object({
  productIds: z.array(z.string().uuid()).max(60).default([]),
  names: z.array(z.string().min(2).max(200)).max(60).default([]),
});

export async function getFavoriteDeals(input: unknown) {
  return await Sentry.withServerActionInstrumentation('getFavoriteDeals', { recordResponse: true }, async () => {
    try {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return { success: false, deals: [] };
      const { productIds, names } = parsed.data;
      if (productIds.length === 0 && names.length === 0) return { success: true, deals: [] };

      const h = await headers();
      const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!checkRateLimit(`favdeals:${ip}`, 30, 60_000)) return { success: false, deals: [] };

      const or: object[] = [];
      if (productIds.length > 0) or.push({ productId: { in: productIds } });
      if (names.length > 0) or.push({ productName: { in: names } });

      const deals = await prisma.discount.findMany({
        where: { isActive: true, validUntil: { gt: new Date() }, OR: or },
        include: { store: true, leaflet: true, product: true },
        orderBy: [{ hotScore: 'desc' }, { validUntil: 'asc' }, { id: 'asc' }],
        take: 30,
      });

      return { success: true, deals };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, deals: [] };
    }
  });
}
