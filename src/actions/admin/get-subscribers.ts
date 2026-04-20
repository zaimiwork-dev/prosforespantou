'use server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';

export async function getSubscribers() {
  return await Sentry.withServerActionInstrumentation('getSubscribers', { recordResponse: true }, async () => {
    try {
      await requireAdmin();
      
      const [total, confirmed, pending, unsubscribed] = await Promise.all([
        prisma.subscriber.count(),
        prisma.subscriber.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null } }),
        prisma.subscriber.count({ where: { confirmedAt: null } }),
        prisma.subscriber.count({ where: { unsubscribedAt: { not: null } } }),
      ]);

      const subscribers = await prisma.subscriber.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });

      return { 
        success: true, 
        counts: { total, confirmed, pending, unsubscribed },
        subscribers: subscribers.map(s => ({
          email: s.email,
          source: s.source,
          confirmedAt: s.confirmedAt?.toISOString() || null,
          unsubscribedAt: s.unsubscribedAt?.toISOString() || null,
          createdAt: s.createdAt.toISOString(),
        }))
      };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error', counts: { total: 0, confirmed: 0, pending: 0, unsubscribed: 0 }, subscribers: [] };
    }
  });
}
