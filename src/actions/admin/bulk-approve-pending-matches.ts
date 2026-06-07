'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';

// Same mapping the single-row approve uses. Keep in sync.
const SM_MAPPING: Record<string, string> = {
  ab: 'AB Vassilopoulos',
  lidl: 'Lidl',
  sklavenitis: 'Σκλαβενίτης',
  mymarket: 'My Market',
  masoutis: 'Μασούτης',
  bazaar: 'Bazaar',
  kritikos: 'Κρητικός',
  marketin: 'Market In',
  discountmarkt: 'Discount Markt',
  galaxias: 'Γαλαξίας',
};

const inputSchema = z.object({
  supermarket: z.string().min(1).max(32),
  // Confidence is on a 0–100 scale in PendingMatch.aiConfidence.
  minConfidence: z.number().int().min(0).max(100),
  category: z.string().min(1).max(100).default('Άλλο'),
  maxRows: z.number().int().positive().max(10_000).optional(),
});

export async function bulkApprovePendingMatches(input: unknown) {
  return await Sentry.withServerActionInstrumentation(
    'bulkApprovePendingMatches',
    { recordResponse: true },
    async () => {
      try {
        await requireAdmin();

        const parsed = inputSchema.safeParse(input);
        if (!parsed.success) {
          return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid input' };
        }

        const { supermarket, minConfidence, category, maxRows = 2000 } = parsed.data;
        const storeName = SM_MAPPING[supermarket];
        if (!storeName) return { success: false as const, error: 'Unknown supermarket' };

        const candidates = await prisma.pendingMatch.findMany({
          where: {
            supermarket,
            suggestedProductId: { not: null },
            aiConfidence: { gte: minConfidence },
          },
          take: maxRows,
        });

        if (candidates.length === 0) {
          return { success: true as const, approved: 0, skipped: 0, remaining: await prisma.pendingMatch.count({ where: { supermarket } }) };
        }

        const store = await prisma.store.upsert({
          where: { name: storeName },
          update: {},
          create: { name: storeName },
        });

        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        let approved = 0;
        let skipped = 0;

        // Same shape as the single-row approve action: upsert Discount,
        // write PriceSnapshot, delete PendingMatch. We don't have an
        // originalPrice signal in the queue → discountPercent is null.
        for (const pending of candidates) {
          if (!pending.suggestedProductId) { skipped++; continue; }
          try {
            const existing = await prisma.discount.findFirst({
              where: { productId: pending.suggestedProductId, supermarket: pending.supermarket, source: 'web' },
              orderBy: { updatedAt: 'desc' },
            });

            if (existing) {
              await prisma.discount.update({
                where: { id: existing.id },
                data: {
                  productName: pending.rawName,
                  category,
                  discountedPrice: pending.rawPrice,
                  originalPrice: null,
                  discountPercent: null,
                  validFrom: now,
                  validUntil: nextWeek,
                  isActive: true,
                },
              });
            } else {
              await prisma.discount.create({
                data: {
                  storeId: store.id,
                  supermarket: pending.supermarket,
                  productName: pending.rawName,
                  category,
                  originalPrice: null,
                  discountedPrice: pending.rawPrice,
                  discountPercent: null,
                  validFrom: now,
                  validUntil: nextWeek,
                  isActive: true,
                  productId: pending.suggestedProductId,
                  source: 'web',
                },
              });
            }

            await prisma.priceSnapshot.create({
              data: {
                productId: pending.suggestedProductId,
                supermarket: pending.supermarket,
                price: pending.rawPrice,
                isDiscounted: false,
              },
            });

            await prisma.pendingMatch.delete({ where: { id: pending.id } });
            approved++;
          } catch (err) {
            console.error('bulkApprovePendingMatches: per-row failure', pending.id, err);
            skipped++;
          }
        }

        if (approved > 0) revalidateTag('deals:default', 'max');

        const remaining = await prisma.pendingMatch.count({ where: { supermarket } });
        return { success: true as const, approved, skipped, remaining };
      } catch (error) {
        Sentry.captureException(error);
        console.error('bulkApprovePendingMatches failed:', error);
        return { success: false as const, error: 'Internal server error' };
      }
    }
  );
}
