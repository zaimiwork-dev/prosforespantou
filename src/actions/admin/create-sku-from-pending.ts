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
  category: z.string().min(1).max(100),
  originalPrice: z.number().nullable().optional(),
  validUntil: z.coerce.date().optional(),
});

// Greek supermarket weekly offer cycles end Sunday. Default to upcoming Sunday
// 23:59 UTC so a weekday "Create SKU" click doesn't expire mid-cycle.
function defaultValidUntil(now: Date): Date {
  const sunday = new Date(now);
  const daysToSunday = (7 - sunday.getUTCDay()) % 7;
  sunday.setUTCDate(sunday.getUTCDate() + daysToSunday);
  sunday.setUTCHours(23, 59, 59, 999);
  if (sunday <= now) sunday.setUTCDate(sunday.getUTCDate() + 7);
  return sunday;
}

export async function createSkuFromPending(input: unknown) {
  return await Sentry.withServerActionInstrumentation('createSkuFromPending', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };

      const { pendingMatchId, category, originalPrice, validUntil: validUntilInput } = parsed.data;

      const pending = await prisma.pendingMatch.findUnique({ where: { id: pendingMatchId } });
      if (!pending) return { success: false, error: 'Pending match not found' };
      if (!pending.imageUrl) return { success: false, error: 'No image on pending match — cannot create SKU' };

      const storeName = SM_MAPPING[pending.supermarket];
      if (!storeName) return { success: false, error: 'Unknown supermarket' };

      const store = await prisma.store.upsert({
        where: { name: storeName },
        update: {},
        create: { name: storeName },
      });

      const newProduct = await prisma.product.create({
        data: {
          name: pending.rawName,
          description: pending.rawName,
          imageUrl: pending.imageUrl,
          supermarket: pending.supermarket,
          storeId: store.id,
        },
      });

      const now = new Date();
      const validUntil = validUntilInput ?? defaultValidUntil(now);
      const discountPercent =
        originalPrice && originalPrice > pending.rawPrice
          ? Math.round(((originalPrice - pending.rawPrice) / originalPrice) * 100)
          : null;

      // Display-first: if the ingest pipeline already shows this offer as a
      // productless Discount, claim it for the new SKU instead of creating a
      // duplicate card.
      const claimed = await prisma.discount.updateMany({
        where: { supermarket: pending.supermarket, productName: pending.rawName, productId: null },
        data: { productId: newProduct.id, category },
      });

      if (claimed.count === 0) {
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
            validUntil,
            isActive: true,
            productId: newProduct.id,
            source: 'web',
            hotScore: computeHotScore({
              productName: pending.rawName,
              description: null,
              discountPercent,
              createdAt: now,
              clicks: 0,
            }),
          },
        });
      }

      await prisma.priceSnapshot.create({
        data: {
          productId: newProduct.id,
          supermarket: pending.supermarket,
          price: pending.rawPrice,
          isDiscounted: !!originalPrice,
        },
      });

      await prisma.pendingMatch.delete({ where: { id: pendingMatchId } });

      revalidateTag('deals:default', 'max');
      return { success: true, productId: newProduct.id };
    } catch (error) {
      Sentry.captureException(error);
      console.error('createSkuFromPending failed:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
