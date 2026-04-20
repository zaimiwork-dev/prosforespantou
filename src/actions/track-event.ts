'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';

const schema = z.object({
  eventType: z.enum(['deal_click', 'leaflet_click', 'list_add']),
  supermarket: z.string().min(1).max(32),
  discountId: z.string().uuid().optional(),
  leafletId: z.string().uuid().optional(),
  category: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
});

export async function trackEvent(input: unknown) {
  return await Sentry.withServerActionInstrumentation('trackEvent', { recordResponse: false }, async () => {
    try {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { success: false };

      const h = await headers();
      const userAgent = h.get('user-agent')?.slice(0, 256) ?? null;

      await prisma.clickEvent.create({
        data: {
          eventType: parsed.data.eventType,
          supermarket: parsed.data.supermarket,
          discountId: parsed.data.discountId,
          leafletId: parsed.data.leafletId,
          category: parsed.data.category,
          sessionId: parsed.data.sessionId,
          userAgent,
        },
      });
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false };
    }
  });
}
