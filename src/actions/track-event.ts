'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';
import { CLICK_WEIGHT } from '@/lib/hotness';

// Consent-gated behavioural events (client only fires these after opt-in — see
// lib/track.js + lib/consent.js). All of them land in ClickEvent: `supermarket`
// defaults to 'site' when not store-scoped. Since W3d (2026-09-15) the context
// has its own columns — `position` (slot in the list), `page` (the surface),
// `query` (search text / filter state), `resultCount` — instead of being
// squeezed into the free-form `category` label.
const EVENT_TYPES = [
  'deal_click', 'leaflet_click', 'list_add', 'list_remove',
  'page_view', 'search', 'filter', 'store_select',
  'favorite', 'unfavorite', 'outbound_click',
] as const;

const schema = z.object({
  eventType: z.enum(EVENT_TYPES),
  supermarket: z.string().min(1).max(32).optional(), // optional for non-store events (page_view…)
  discountId: z.string().uuid().optional(),
  leafletId: z.string().uuid().optional(),
  category: z.string().max(120).optional(),
  sessionId: z.string().max(64).optional(),
  position: z.number().int().min(0).max(9999).optional(),
  page: z.string().max(64).optional(),
  query: z.string().max(200).optional(),
  resultCount: z.number().int().min(0).max(1_000_000).optional(),
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

      const h = await headers();
      const ip = h.get('x-forwarded-for') || 'unknown';
      // 60 events/min per IP — well above any legitimate browsing pattern,
      // tight enough to blunt opportunistic spam of the analytics table.
      if (!checkRateLimit(`track:${ip}`, 60, 60_000)) {
        return { success: false, rateLimited: true };
      }

      const d = parsed.data;
      if (d.sessionId) {
        const target = d.discountId ?? d.leafletId ?? d.query ?? d.category ?? d.supermarket;
        const key = `${d.sessionId}:${d.eventType}:${target}`;
        if (isDuplicate(key)) return { success: true, deduped: true };
      }

      const userAgent = h.get('user-agent')?.slice(0, 256) ?? null;

      await prisma.clickEvent.create({
        data: {
          eventType: d.eventType,
          supermarket: d.supermarket ?? 'site', // non-store events (page_view…) aren't store-scoped
          discountId: d.discountId,
          leafletId: d.leafletId,
          category: d.category,
          sessionId: d.sessionId,
          userAgent,
          position: d.position,
          page: d.page,
          query: d.query,
          resultCount: d.resultCount,
        },
      });

      // Bump the deal's popularity signal so it climbs the hot sort immediately.
      // CLICK_WEIGHT mirrors the per-click term in computeHotScore; the nightly
      // recompute then re-derives hotScore authoritatively (windowed clicks).
      if (d.eventType === 'deal_click' && d.discountId) {
        await prisma.discount.update({
          where: { id: d.discountId },
          data: {
            clickCount: { increment: 1 },
            hotScore: { increment: CLICK_WEIGHT },
          },
        }).catch(() => {}); // a deleted/expired discount shouldn't fail tracking
      }
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false };
    }
  });
}

// Impressions: a card counted as seen (≥50% on screen for ≥1 s, see
// lib/impressions.js). Batched by the client and written with createMany.
// dedupKey = session:discount:page:UTC day, unique in the table, so a retried
// batch or a card scrolled past twice in a day is written once.
// Impressions are the denominator every ranking and personalization metric
// needs (click-through by slot, by rail, by staple); without them a click
// count cannot tell a bad card from an unseen one.
const impressionSchema = z.object({
  sessionId: z.string().min(1).max(64),
  items: z.array(z.object({
    discountId: z.string().uuid(),
    supermarket: z.string().min(1).max(32).optional(),
    page: z.string().min(1).max(64),
    position: z.number().int().min(0).max(9999).optional(),
  })).min(1).max(50),
});

export async function trackImpressions(input: unknown) {
  return await Sentry.withServerActionInstrumentation('trackImpressions', { recordResponse: false }, async () => {
    try {
      const parsed = impressionSchema.safeParse(input);
      if (!parsed.success) return { success: false };

      const h = await headers();
      const ip = h.get('x-forwarded-for') || 'unknown';
      // A flush every 5 s is 12/min; 30 leaves room for fast scrolling.
      if (!checkRateLimit(`impr:${ip}`, 30, 60_000)) {
        return { success: false, rateLimited: true };
      }

      const { sessionId, items } = parsed.data;
      const day = new Date().toISOString().slice(0, 10);
      const userAgent = h.get('user-agent')?.slice(0, 256) ?? null;

      const result = await prisma.clickEvent.createMany({
        data: items.map((it) => ({
          eventType: 'impression',
          supermarket: it.supermarket ?? 'site',
          discountId: it.discountId,
          sessionId,
          userAgent,
          page: it.page,
          position: it.position,
          dedupKey: `${sessionId}:${it.discountId}:${it.page}:${day}`,
        })),
        skipDuplicates: true,
      });
      return { success: true, written: result.count };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false };
    }
  });
}
