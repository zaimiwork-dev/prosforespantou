'use server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { listWatches, removeWatch } from '@/lib/product-watches';

// The manage page is opened from two links: the confirmation email carries the
// confirm token, every alert email the unsubscribe token (2026-11-23: the
// second never worked — the page only looked up the first). Both are
// unguessable per-person secrets, so either opens the page.
const byToken = (token: string) => prisma.subscriber.findFirst({
  where: { OR: [{ confirmToken: token }, { unsubToken: token }] },
});

const MAX_ALERTS_PER_USER = 50;

const alertSchema = z.object({
  token: z.string().uuid(),
  keyword: z.string().trim().min(2).max(64),
  supermarkets: z.array(z.string().max(32)).max(20).optional(),
  category: z.string().max(64).optional(),
  maxPrice: z.number().positive().max(99999).optional().nullable(),
});

export async function getAlerts(token: string) {
  return await Sentry.withServerActionInstrumentation('getAlerts', { recordResponse: true }, async () => {
    try {
      if (!z.string().uuid().safeParse(token).success) return { success: false, error: 'Unauthorized' };
      const found = await byToken(token);
      const sub = found && await prisma.subscriber.findUnique({
        where: { id: found.id },
        include: { alerts: { orderBy: { createdAt: 'desc' } } }
      });
      if (!sub) return { success: false, error: 'Unauthorized' };
      if (!sub.confirmedAt) return { success: false, error: 'Email not confirmed', unconfirmed: true };

      // Convert Decimal to number for the client
      const alerts = sub.alerts.map(a => ({
        ...a,
        maxPrice: a.maxPrice ? Number(a.maxPrice) : null,
      }));

      // «Ειδοποίησέ με» products (lib/product-watches), with today's best price.
      const watches = await listWatches(prisma as never, { subscriberId: sub.id });
      return { success: true, alerts, watches };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error' };
    }
  });
}

export async function createAlert(input: unknown) {
  return await Sentry.withServerActionInstrumentation('createAlert', { recordResponse: true }, async () => {
    try {
      const parsed = alertSchema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'Invalid input' };

      const sub = await byToken(parsed.data.token);
      if (!sub || !sub.confirmedAt) return { success: false, error: 'Unauthorized' };

      const existingCount = await prisma.alert.count({ where: { subscriberId: sub.id } });
      if (existingCount >= MAX_ALERTS_PER_USER) {
        return { success: false, error: `Έχεις φτάσει το όριο των ${MAX_ALERTS_PER_USER} ειδοποιήσεων.` };
      }

      const alert = await prisma.alert.create({
        data: {
          subscriberId: sub.id,
          keyword: parsed.data.keyword,
          supermarkets: parsed.data.supermarkets ?? [],
          category: parsed.data.category || null,
          maxPrice: parsed.data.maxPrice || null,
        }
      });

      return { success: true, alert: { ...alert, maxPrice: alert.maxPrice ? Number(alert.maxPrice) : null } };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error' };
    }
  });
}

export async function deleteAlert(token: string, alertId: string) {
  return await Sentry.withServerActionInstrumentation('deleteAlert', { recordResponse: true }, async () => {
    try {
      if (!z.string().uuid().safeParse(token).success) return { success: false, error: 'Unauthorized' };
      const sub = await byToken(token);
      if (!sub) return { success: false, error: 'Unauthorized' };

      await prisma.alert.delete({
        where: { id: alertId, subscriberId: sub.id }
      });

      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error' };
    }
  });
}

export async function deleteWatch(token: string, watchId: string) {
  return await Sentry.withServerActionInstrumentation('deleteWatch', { recordResponse: false }, async () => {
    try {
      const ids = z.object({ token: z.string().uuid(), watchId: z.string().uuid() }).safeParse({ token, watchId });
      if (!ids.success) return { success: false, error: 'Invalid input' };
      const sub = await byToken(token);
      if (!sub) return { success: false, error: 'Unauthorized' };
      const removed = await removeWatch(prisma as never, { subscriberId: sub.id }, watchId);
      return { success: removed };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
