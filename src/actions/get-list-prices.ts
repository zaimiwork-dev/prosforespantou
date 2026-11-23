'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { loadListPrices } from '@/lib/list-prices';
import type { ItemPrices } from '@/lib/list-basket';

const InputSchema = z.array(z.string().uuid()).max(100);

// The shopping list's «σε ποιο κατάστημα βγαίνει φθηνότερα»: every list item's
// price at the other chains, as its comparison sheet shows them. The app reads
// the same data from /api/v1/list-prices.
export async function getListPrices(discountIds: string[]): Promise<Record<string, ItemPrices>> {
  return await Sentry.withServerActionInstrumentation(
    'getListPrices',
    { recordResponse: false },
    async () => {
      const parsed = InputSchema.safeParse(discountIds);
      if (!parsed.success || parsed.data.length === 0) return {};
      const ip = (await headers()).get('x-forwarded-for') || 'unknown';
      if (!checkRateLimit(`list-prices:${ip}`, 120, 60_000)) return {};
      try {
        return await loadListPrices(prisma, [...new Set(parsed.data)]);
      } catch (error) {
        Sentry.captureException(error);
        console.error('Error loading list prices:', error);
        return {};
      }
    },
  );
}
