'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';
import { withPublicDealVisibility } from '@/lib/public-deal-filters';
import { buildReviewRows, REVIEW_PAGE_MAX } from '@/lib/comparison-review';

// Admin «Συγκρίσεις» tab: the AI comparison verdicts on pairs that are live
// right now, so the owner can win back hidden pairs (or hide one the AI let
// through). Shaping lives in lib/comparison-review.
const inputSchema = z.object({
  verdict: z.enum(['same', 'different', 'unsure', 'all']).default('unsure'),
  chain: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(REVIEW_PAGE_MAX).default(50),
});

export async function listComparisonVerdicts(input?: unknown) {
  return await Sentry.withServerActionInstrumentation('listComparisonVerdicts', { recordResponse: false }, async () => {
    try {
      await requireAdmin();

      const parsed = inputSchema.safeParse(input ?? {});
      if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid input' };

      const now = new Date();
      const [verdicts, offers] = await Promise.all([
        prisma.comparisonVerdict.findMany({
          select: { pairKey: true, chainA: true, nameA: true, chainB: true, nameB: true, verdict: true, model: true, reason: true, createdAt: true },
        }),
        prisma.discount.findMany({
          where: withPublicDealVisibility({ isActive: true, validUntil: { gt: now } }),
          select: { id: true, productName: true, supermarket: true, discountedPrice: true, imageUrl: true, hotScore: true },
        }),
      ]);

      return { success: true as const, ...buildReviewRows(verdicts, offers, parsed.data) };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false as const, error: 'Failed to load comparison verdicts' };
    }
  });
}
