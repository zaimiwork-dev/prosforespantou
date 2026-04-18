'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import * as Sentry from "@sentry/nextjs";

const idSchema = z.string().uuid();

export async function deleteDiscount(id: string) {
  return await Sentry.withServerActionInstrumentation('deleteDiscount', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = idSchema.safeParse(id);
      if (!parsed.success) {
        return { success: false, error: 'Invalid id' };
      }

      await prisma.discount.delete({ where: { id: parsed.data } });
      revalidateTag(`offer:${parsed.data}`, 'max');
      revalidateTag('deals:default', 'max');
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      console.error('deleteDiscount failed:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
