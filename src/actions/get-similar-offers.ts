'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { nameSimilarity } from '@/lib/offer-similarity';
import { dedupeDeals } from '@/lib/dedupe-deals';

const InputSchema = z.string().uuid();

// "Παρόμοιες προσφορές" under the offer detail: other active offers from the
// same department, ranked by how alike their names are to this offer (same
// brand/type floats first), topped up with the department's hottest deals.
// Same-product rows are excluded — those belong to ΣΥΓΚΡΙΣΗ ΤΙΜΗΣ above.
export async function getSimilarOffers(discountId: string, limit = 8) {
  return await Sentry.withServerActionInstrumentation(
    'getSimilarOffers',
    { recordResponse: false },
    async () => {
      const parsed = InputSchema.safeParse(discountId);
      if (!parsed.success) return [];

      try {
        const source = await prisma.discount.findUnique({
          where: { id: parsed.data },
          select: { id: true, productName: true, category: true, productId: true },
        });
        if (!source?.category) return [];

        const now = new Date();
        const candidates = await prisma.discount.findMany({
          where: {
            isActive: true,
            validUntil: { gt: now },
            category: source.category,
            NOT: { id: source.id },
            ...(source.productId ? { OR: [{ productId: null }, { productId: { not: source.productId } }] } : {}),
          },
          orderBy: [{ hotScore: 'desc' }, { id: 'asc' }],
          take: 120,
          select: {
            id: true,
            productName: true,
            supermarket: true,
            category: true,
            discountedPrice: true,
            originalPrice: true,
            discountPercent: true,
            imageUrl: true,
            productId: true,
            source: true,
            hotScore: true,
            validFrom: true,
            validUntil: true,
          },
        });

        const ranked = dedupeDeals(
          candidates
            .map((c) => ({ ...c, sim: nameSimilarity(source.productName, c.productName) }))
            .sort((a, b) => (b.sim - a.sim) || (b.hotScore ?? 0) - (a.hotScore ?? 0))
        ).slice(0, limit);

        return ranked.map(({ sim: _sim, ...d }) => ({
          ...d,
          validFrom: d.validFrom.toISOString(),
          validUntil: d.validUntil.toISOString(),
        }));
      } catch (error) {
        Sentry.captureException(error);
        console.error('Error fetching similar offers:', error);
        return [];
      }
    }
  );
}
