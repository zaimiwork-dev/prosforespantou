'use server';

import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';

export async function listPendingMatches(input?: { supermarket?: string; limit?: number }) {
  return await Sentry.withServerActionInstrumentation('listPendingMatches', { recordResponse: false }, async () => {
    try {
      await requireAdmin();
      const limit = Math.min(input?.limit ?? 200, 500);

      const where = input?.supermarket ? { supermarket: input.supermarket } : {};

      const [rows, total] = await Promise.all([
        prisma.pendingMatch.findMany({
          where,
          orderBy: [{ aiConfidence: 'desc' }, { createdAt: 'desc' }],
          take: limit,
          include: {
            product: { select: { id: true, name: true, imageUrl: true } },
          },
        }),
        prisma.pendingMatch.count({ where }),
      ]);

      return {
        success: true as const,
        total,
        rows: rows.map((r) => ({
          id: r.id,
          rawName: r.rawName,
          rawPrice: r.rawPrice,
          supermarket: r.supermarket,
          aiConfidence: r.aiConfidence,
          createdAt: r.createdAt.toISOString(),
          rawImageUrl: r.imageUrl,
          suggestedProduct: r.product
            ? { id: r.product.id, name: r.product.name, imageUrl: r.product.imageUrl }
            : null,
        })),
      };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false as const, error: 'Failed to load pending matches' };
    }
  });
}
