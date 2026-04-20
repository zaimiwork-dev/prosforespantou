'use server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';

export async function getStats() {
  return await Sentry.withServerActionInstrumentation('getStats', { recordResponse: true }, async () => {
    try {
      await requireAdmin();
      const now = new Date();
      const d7 = new Date(now.getTime() - 7 * 86400000);
      const d30 = new Date(now.getTime() - 30 * 86400000);

      const rows = await prisma.clickEvent.groupBy({
        by: ['supermarket', 'eventType'],
        where: { createdAt: { gte: d30 } },
        _count: { _all: true },
      });

      const rows7 = await prisma.clickEvent.groupBy({
        by: ['supermarket', 'eventType'],
        where: { createdAt: { gte: d7 } },
        _count: { _all: true },
      });

      return { success: true, last30: rows, last7: rows7 };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error', last30: [], last7: [] };
    }
  });
}
