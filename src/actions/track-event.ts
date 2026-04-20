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

// Dedup window: same session + event + target within 5s counts once.
// Survives process lifetime only; good enough for accidental double-fires (React StrictMode,
// double-clicks, prefetchers). Real abuse protection would need a rate limiter.
const recent = new Map<string, number>();
const WINDOW_MS = 5000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > WINDOW_MS) recent.delete(k);
  const last = recent.get(key);
  if (last && now - last < WINDOW_MS) return true;
  recent.set(key, now);
  return false;
}

export async function trackEvent(input: unknown) {
  return await Sentry.withServerActionInstrumentation('trackEvent', { recordResponse: false }, async () => {
    try {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { success: false };

      const d = parsed.data;
      if (d.sessionId) {
        const key = `${d.sessionId}:${d.eventType}:${d.discountId ?? d.leafletId ?? d.supermarket}`;
        if (isDuplicate(key)) return { success: true, deduped: true };
      }

      const h = await headers();
      const userAgent = h.get('user-agent')?.slice(0, 256) ?? null;

      await prisma.clickEvent.create({
        data: {
          eventType: d.eventType,
          supermarket: d.supermarket,
          discountId: d.discountId,
          leafletId: d.leafletId,
          category: d.category,
          sessionId: d.sessionId,
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
