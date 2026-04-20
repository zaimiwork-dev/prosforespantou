'use server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';

const alertSchema = z.object({
  token: z.string().uuid(),
  keyword: z.string().min(2).max(64),
  supermarkets: z.array(z.string()).optional(),
  category: z.string().optional(),
  maxPrice: z.number().optional().nullable(),
});

export async function getAlerts(token: string) {
  return await Sentry.withServerActionInstrumentation('getAlerts', { recordResponse: true }, async () => {
    try {
      const sub = await prisma.subscriber.findUnique({
        where: { confirmToken: token },
        include: { alerts: { orderBy: { createdAt: 'desc' } } }
      });
      if (!sub) return { success: false, error: 'Unauthorized' };
      if (!sub.confirmedAt) return { success: false, error: 'Email not confirmed', unconfirmed: true };

      // Convert Decimal to number for the client
      const alerts = sub.alerts.map(a => ({
        ...a,
        maxPrice: a.maxPrice ? Number(a.maxPrice) : null,
      }));

      return { success: true, alerts };
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

      const sub = await prisma.subscriber.findUnique({
        where: { confirmToken: parsed.data.token }
      });
      if (!sub || !sub.confirmedAt) return { success: false, error: 'Unauthorized' };

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
      const sub = await prisma.subscriber.findUnique({
        where: { confirmToken: token }
      });
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
