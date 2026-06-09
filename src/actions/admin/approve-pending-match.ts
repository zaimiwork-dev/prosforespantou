'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { computeHotScore } from '@/lib/hotness';

const SM_MAPPING: Record<string, string> = {
  ab: 'AB Vassilopoulos',
  lidl: 'Lidl',
  sklavenitis: 'Σκλαβενίτης',
  mymarket: 'My Market',
  masoutis: 'Μασούτης',
  bazaar: 'Bazaar',
  kritikos: 'Κρητικός',
  marketin: 'Market In',
  discountmarkt: 'Discount Markt',
  galaxias: 'Γαλαξίας',
};

const inputSchema = z.object({
  pendingMatchId: z.string().uuid(),
  productId: z.string().uuid(),
  category: z.string().min(1).max(100),
  originalPrice: z.number().nullable().optional(),
});

export async function approvePendingMatch(input: unknown) {
  return await Sentry.withServerActionInstrumentation('approvePendingMatch', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
      }

      const { pendingMatchId, productId, category, originalPrice } = parsed.data;

      const pending = await prisma.pendingMatch.findUnique({ where: { id: pendingMatchId } });
      if (!pending) return { success: false, error: 'Pending match not found' };

      const storeName = SM_MAPPING[pending.supermarket];
      if (!storeName) return { success: false, error: 'Unknown supermarket' };

      const store = await prisma.store.upsert({
        where: { name: storeName },
        update: {},
        create: { name: storeName },
      });

      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const discountPercent =
        originalPrice && originalPrice > pending.rawPrice
          ? Math.round(((originalPrice - pending.rawPrice) / originalPrice) * 100)
          : null;

      const existing = await prisma.discount.findFirst({
        where: { productId, supermarket: pending.supermarket, source: 'web' },
        orderBy: { updatedAt: 'desc' },
      });

      const hotScore = computeHotScore({
        productName: pending.rawName,
        description: null,
        discountPercent,
        createdAt: existing ? existing.createdAt : now,
        clicks: existing ? existing.clickCount : 0,
      });

      if (existing) {
        await prisma.discount.update({
          where: { id: existing.id },
          data: {
            productName: pending.rawName,
            category,
            discountedPrice: pending.rawPrice,
            originalPrice: originalPrice ?? null,
            discountPercent,
            validFrom: now,
            validUntil: nextWeek,
            isActive: true,
            hotScore,
          },
        });
      } else {
        await prisma.discount.create({
          data: {
            storeId: store.id,
            supermarket: pending.supermarket,
            productName: pending.rawName,
            category,
            originalPrice: originalPrice ?? null,
            discountedPrice: pending.rawPrice,
            discountPercent,
            validFrom: now,
            validUntil: nextWeek,
            isActive: true,
            productId,
            source: 'web',
            hotScore,
          },
        });
      }

      await prisma.priceSnapshot.create({
        data: {
          productId,
          supermarket: pending.supermarket,
          price: pending.rawPrice,
          isDiscounted: !!originalPrice,
        },
      });

      await prisma.pendingMatch.delete({ where: { id: pendingMatchId } });

      revalidateTag('deals:default', 'max');
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      console.error('approvePendingMatch failed:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
