'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';

const inputSchema = z.object({
  discountId: z.string().uuid(),
  featured: z.boolean(),
  durationDays: z.number().int().min(1).max(60).optional(),
  label: z.string().max(40).optional(),
});

export async function setFeatured(input: unknown) {
  return await Sentry.withServerActionInstrumentation('setFeatured', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };

      const { discountId, featured, durationDays = 7, label } = parsed.data;

      const featuredUntil = featured
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
        : null;

      await prisma.discount.update({
        where: { id: discountId },
        data: {
          isFeatured: featured,
          featuredUntil,
          featuredLabel: featured ? (label ?? null) : null,
        },
      });

      revalidateTag(`offer:${discountId}`, 'max');
      revalidateTag('deals:default', 'max');
      return { success: true, featuredUntil };
    } catch (error) {
      Sentry.captureException(error);
      console.error('setFeatured failed:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
