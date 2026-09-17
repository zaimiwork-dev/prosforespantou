'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';
import { CLICK_WEIGHT } from '@/lib/hotness';

// Behavioural events. All of them land in ClickEvent: `supermarket` defaults to
// 'site' when not store-scoped. Since W3d (2026-09-15) the context has its own
// columns — `position` (slot in the list), `page` (the surface), `query`
// (search text / filter state), `resultCount` — instead of being squeezed into
// the free-form `category` label.
//
// Who may send them is lib/analytics-mode's decision, not this file's. Two
// kinds arrive here (2026-09-17):
//   • identified — carries `sessionId`, so a visit can be followed end to end.
//   • anonymous  — carries no id at all. Nothing here may turn such an event
//     into a person, which is why NOTHING about the device is recorded: no
//     user agent (see below) and no IP. The IP is read for rate limiting and
//     thrown away with the request.
//
// The user agent used to be written on every row. It was never read by
// anything — five months of rows, no query — while being the single most
// identifying field in the table, so it is no longer stored at all. Rows
// written before 2026-09-17 still hold theirs; clearing those is the owner's
// call (a one-line UPDATE).
// `sessionId` tells the two apart at a glance and, more importantly, makes the
// second kind removable in one statement if counsel ever says no:
//   • a bare UUID  — a consented visitor's persistent `sid`.
//   • `v-<uuid>`   — a tab-scoped visit id (lib/visit-id), which dies with the
//     tab and can never link two visits. `WHERE "sessionId" LIKE 'v-%'`.
const EVENT_TYPES = [
  'deal_click', 'leaflet_click', 'list_add', 'list_remove',
  'page_view', 'search', 'filter', 'store_select',
  'favorite', 'unfavorite', 'outbound_click',
  // The banner's own answer, always sent without an id: a count of choices,
  // never a record of who chose. It is the only way to learn what share of
  // shoppers a consented feature can ever reach.
  'consent_choice',
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
  // One short label for the SLOT, never the person: 'mine' when the card's
  // chain is one this shopper ticked, 'other' when it is not. With anonymous
  // events carrying no identifier, this is the only way to answer whether the
  // preferred-store boost earns its place.
  context: z.enum(['mine', 'other']).optional(),
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
      // Read for rate limiting only, never stored — see the note at the top.
      const ip = h.get('x-forwarded-for') || 'unknown';
      // Raised from 60 on 2026-09-17: events now come from every visitor, not
      // only the few who consented, and Greek mobile carriers put many
      // shoppers behind one address. 240/min still bounds a spammer, and the
      // client-side 5 s window drops the accidental repeats.
      if (!checkRateLimit(`track:${ip}`, 240, 60_000)) {
        return { success: false, rateLimited: true };
      }

      const d = parsed.data;
      if (d.sessionId) {
        const target = d.discountId ?? d.leafletId ?? d.query ?? d.category ?? d.supermarket;
        const key = `${d.sessionId}:${d.eventType}:${target}`;
        if (isDuplicate(key)) return { success: true, deduped: true };
      }

      await prisma.clickEvent.create({
        data: {
          eventType: d.eventType,
          supermarket: d.supermarket ?? 'site', // non-store events (page_view…) aren't store-scoped
          discountId: d.discountId,
          leafletId: d.leafletId,
          category: d.category,
          sessionId: d.sessionId,
          position: d.position,
          page: d.page,
          query: d.query,
          resultCount: d.resultCount,
          context: d.context,
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
// Impressions are the denominator every ranking and personalization metric
// needs (click-through by slot, by rail, by staple); without them a click
// count cannot tell a bad card from an unseen one.
//
// With a session id, dedupKey = session:discount:page:UTC day is unique in the
// table, so a retried batch or a card scrolled past twice in a day is written
// once. An anonymous batch has no id to build that key from and leaves it
// null — Postgres allows many nulls in a unique index — so the duplicate guard
// moves to the client, where the queue already refuses a card it has queued
// this page load (lib/impression-queue).
const impressionSchema = z.object({
  sessionId: z.string().min(1).max(64).optional(),
  items: z.array(z.object({
    discountId: z.string().uuid(),
    supermarket: z.string().min(1).max(32).optional(),
    page: z.string().min(1).max(64),
    position: z.number().int().min(0).max(9999).optional(),
    context: z.enum(['mine', 'other']).optional(),
  })).min(1).max(50),
});

export async function trackImpressions(input: unknown) {
  return await Sentry.withServerActionInstrumentation('trackImpressions', { recordResponse: false }, async () => {
    try {
      const parsed = impressionSchema.safeParse(input);
      if (!parsed.success) return { success: false };

      const h = await headers();
      // Read for rate limiting only, never stored.
      const ip = h.get('x-forwarded-for') || 'unknown';
      // A flush every 5 s is 12/min per shopper. Raised from 30 on 2026-09-17:
      // impressions now come from every visitor, and one Greek mobile carrier
      // address can carry a lot of them. 120 leaves room for ten shoppers
      // scrolling hard behind one IP.
      if (!checkRateLimit(`impr:${ip}`, 120, 60_000)) {
        return { success: false, rateLimited: true };
      }

      const { sessionId, items } = parsed.data;
      const day = new Date().toISOString().slice(0, 10);

      const result = await prisma.clickEvent.createMany({
        data: items.map((it) => ({
          eventType: 'impression',
          supermarket: it.supermarket ?? 'site',
          discountId: it.discountId,
          sessionId,
          page: it.page,
          position: it.position,
          context: it.context,
          dedupKey: sessionId ? `${sessionId}:${it.discountId}:${it.page}:${day}` : null,
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
