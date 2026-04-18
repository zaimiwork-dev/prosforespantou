'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import { discountInputSchema } from '@/lib/validations/discount-input';
import * as Sentry from "@sentry/nextjs";

const SM_MAPPING: Record<string, string> = {
  ab: 'AB Vassilopoulos',
  lidl: 'Lidl',
  sklavenitis: 'Σκλαβενίτης',
  mymarket: 'My Market',
  masoutis: 'Μασούτης',
  bazaar: 'Bazaar',
  kritikos: 'Κρητικός',
  marketin: 'Market In',
};

export async function createDiscount(input: unknown) {
  return await Sentry.withServerActionInstrumentation('createDiscount', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = discountInputSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
      }

      const data = parsed.data;
      const storeName = SM_MAPPING[data.supermarket];
      if (!storeName) {
        return { success: false, error: 'Unknown supermarket' };
      }

      const store = await prisma.store.upsert({
        where: { name: storeName },
        update: {},
        create: { name: storeName },
      });

      const created = await prisma.discount.create({
        data: {
          storeId: store.id,
          supermarket: data.supermarket,
          productName: data.productName,
          category: data.category,
          originalPrice: data.originalPrice,
          discountedPrice: data.discountedPrice,
          discountPercent: data.discountPercent,
          description: data.description,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          imageUrl: data.imageUrl,
          isActive: data.isActive,
        },
      });

      revalidateTag('deals:default', 'max');
      return { success: true, id: created.id };
    } catch (error) {
      Sentry.captureException(error);
      console.error('createDiscount failed:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
