'use server';

import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';

export async function listDiscounts({ limit = 100, offset = 0, supermarket = 'all', search = '', isFeatured = false } = {}) {
  return await Sentry.withServerActionInstrumentation('listDiscounts', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const where: any = {};
      if (supermarket !== 'all') where.supermarket = supermarket;
      if (isFeatured) where.isFeatured = true;
      if (search.trim()) {
        where.productName = { contains: search.trim(), mode: 'insensitive' };
      }

      const [discounts, total] = await Promise.all([
        prisma.discount.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: { store: { select: { name: true } } },
        }),
        prisma.discount.count({ where }),
      ]);

      return { success: true, discounts, total };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error', discounts: [], total: 0 };
    }
  });
}
