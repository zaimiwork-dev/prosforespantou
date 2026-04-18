'use server';

import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';

export async function listDiscounts({ limit = 100, offset = 0, supermarket = 'all', search = '' } = {}) {
  await requireAdmin();

  const where: Record<string, unknown> = {};
  if (supermarket !== 'all') where.supermarket = supermarket;
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

  return { discounts, total };
}
