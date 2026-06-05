'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

export interface CheaperAlternative {
  discountId: string;
  productId: string;
  productName: string;
  supermarket: string;
  discountedPrice: number;
  savings: number;
}

const InputSchema = z.array(z.string().uuid()).max(100);

export async function getCheaperAlternatives(
  discountIds: string[]
): Promise<Record<string, CheaperAlternative | null>> {
  return await Sentry.withServerActionInstrumentation(
    'getCheaperAlternatives',
    { recordResponse: false },
    async () => {
      const parsed = InputSchema.safeParse(discountIds);
      if (!parsed.success || parsed.data.length === 0) return {};

      try {
        const sources = await prisma.discount.findMany({
          where: { id: { in: parsed.data } },
          select: {
            id: true,
            productId: true,
            discountedPrice: true,
            supermarket: true,
            product: { select: { id: true, barcode: true } },
          },
        });

        if (sources.length === 0) return {};

        const barcodes = Array.from(
          new Set(sources.map((s) => s.product?.barcode).filter((b): b is string => !!b))
        );

        const barcodeToProductIds = new Map<string, Set<string>>();
        if (barcodes.length > 0) {
          const products = await prisma.product.findMany({
            where: { barcode: { in: barcodes } },
            select: { id: true, barcode: true },
          });
          for (const p of products) {
            if (!p.barcode) continue;
            if (!barcodeToProductIds.has(p.barcode)) barcodeToProductIds.set(p.barcode, new Set());
            barcodeToProductIds.get(p.barcode)!.add(p.id);
          }
        }

        const allProductIds = new Set<string>();
        for (const s of sources) {
          if (s.productId) allProductIds.add(s.productId);
          const bc = s.product?.barcode;
          if (bc) for (const pid of barcodeToProductIds.get(bc) ?? []) allProductIds.add(pid);
        }

        if (allProductIds.size === 0) return {};

        const now = new Date();
        const candidates = await prisma.discount.findMany({
          where: {
            productId: { in: [...allProductIds] },
            isActive: true,
            validUntil: { gt: now },
            id: { notIn: parsed.data },
          },
          select: {
            id: true,
            productId: true,
            discountedPrice: true,
            supermarket: true,
            product: { select: { name: true } },
          },
          orderBy: { discountedPrice: 'asc' },
        });

        const byProductId = new Map<string, typeof candidates>();
        for (const c of candidates) {
          if (!c.productId) continue;
          if (!byProductId.has(c.productId)) byProductId.set(c.productId, []);
          byProductId.get(c.productId)!.push(c);
        }

        const out: Record<string, CheaperAlternative | null> = {};
        for (const s of sources) {
          const matched = new Set<string>();
          if (s.productId) matched.add(s.productId);
          const bc = s.product?.barcode;
          if (bc) for (const pid of barcodeToProductIds.get(bc) ?? []) matched.add(pid);

          let best: (typeof candidates)[number] | null = null;
          for (const pid of matched) {
            for (const c of byProductId.get(pid) ?? []) {
              if (c.supermarket === s.supermarket) continue;
              if (c.discountedPrice >= s.discountedPrice) continue;
              if (!best || c.discountedPrice < best.discountedPrice) best = c;
            }
          }

          out[s.id] = best
            ? {
                discountId: best.id,
                productId: best.productId!,
                productName: best.product?.name ?? '',
                supermarket: best.supermarket,
                discountedPrice: best.discountedPrice,
                savings: s.discountedPrice - best.discountedPrice,
              }
            : null;
        }

        return out;
      } catch (error) {
        Sentry.captureException(error);
        console.error('Error fetching cheaper alternatives:', error);
        return {};
      }
    }
  );
}
