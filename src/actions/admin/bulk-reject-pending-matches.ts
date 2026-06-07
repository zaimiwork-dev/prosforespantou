'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';

const inputSchema = z.object({
  supermarket: z.string().min(1).max(32),
  // Optional ceiling so a stray click doesn't nuke 5,000 rows. Defaults to 5000.
  maxRows: z.number().int().positive().max(20_000).optional(),
});

export async function bulkRejectPendingMatches(input: unknown) {
  return await Sentry.withServerActionInstrumentation(
    'bulkRejectPendingMatches',
    { recordResponse: true },
    async () => {
      try {
        await requireAdmin();

        const parsed = inputSchema.safeParse(input);
        if (!parsed.success) {
          return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid input' };
        }

        const { supermarket, maxRows = 5000 } = parsed.data;

        // Cap to maxRows in case the queue is enormous. Subsequent calls
        // chip away at the remainder.
        const ids = await prisma.pendingMatch.findMany({
          where: { supermarket },
          select: { id: true },
          take: maxRows,
        });

        if (ids.length === 0) {
          return { success: true as const, rejected: 0, remaining: 0 };
        }

        const result = await prisma.pendingMatch.deleteMany({
          where: { id: { in: ids.map((r) => r.id) } },
        });

        const remaining = await prisma.pendingMatch.count({ where: { supermarket } });
        return { success: true as const, rejected: result.count, remaining };
      } catch (error) {
        Sentry.captureException(error);
        console.error('bulkRejectPendingMatches failed:', error);
        return { success: false as const, error: 'Internal server error' };
      }
    }
  );
}
