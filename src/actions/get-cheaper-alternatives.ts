'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { samePack } from '@/lib/packaging';
import { filterComparable } from '@/lib/offer-similarity';
import { filterByVerdict, itemKey, loadVerdictLookup, pairKeyOf } from '@/lib/comparison-verdict';
import { linkedItems, loadLinksFor } from '@/lib/item-links';
import { withPublicDealVisibility } from '@/lib/public-deal-filters';

export interface CheaperAlternative {
  discountId: string;
  productId: string;
  productName: string;
  supermarket: string;
  discountedPrice: number;
  savings: number;
}

const InputSchema = z.array(z.string().uuid()).max(100);

// Ignore trivially-small differences — a 6-cent "cheaper elsewhere" is noise.
// Only surface an alternative that saves at least this much.
const MIN_SAVINGS = 0.10;

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
            productName: true,
            discountedPrice: true,
            supermarket: true,
            chainItemcode: true,
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

        // Cross-chain item links (lib/item-links): items at other chains
        // confirmed to be the same product though they sit on another product
        // record — the same rule the comparison sheet follows.
        const links = await loadLinksFor(prisma, sources.map((s) => ({ chain: s.supermarket, code: s.chainItemcode })));
        const linkedOf = new Map(sources.map((s) => [s.id, linkedItems(links, { chain: s.supermarket, code: s.chainItemcode })]));
        const linkedRefs = [...new Map([...linkedOf.values()].flat().map((r) => [itemKey(r), r])).values()];

        if (allProductIds.size === 0 && linkedRefs.length === 0) return {};

        const now = new Date();
        const candidates = await prisma.discount.findMany({
          where: withPublicDealVisibility({
            OR: [
              ...(allProductIds.size > 0 ? [{ productId: { in: [...allProductIds] } }] : []),
              ...linkedRefs.map((r) => ({ supermarket: r.chain, chainItemcode: r.code })),
            ],
            isActive: true,
            validUntil: { gt: now },
            id: { notIn: parsed.data },
          }),
          select: {
            id: true,
            productId: true,
            productName: true,
            discountedPrice: true,
            supermarket: true,
            chainItemcode: true,
            product: { select: { name: true } },
          },
          orderBy: { discountedPrice: 'asc' },
        });

        const byProductId = new Map<string, typeof candidates>();
        const byItem = new Map<string, typeof candidates>();
        for (const c of candidates) {
          if (c.productId) {
            if (!byProductId.has(c.productId)) byProductId.set(c.productId, []);
            byProductId.get(c.productId)!.push(c);
          }
          if (c.chainItemcode) {
            const k = itemKey({ chain: c.supermarket, code: c.chainItemcode });
            if (!byItem.has(k)) byItem.set(k, []);
            byItem.get(k)!.push(c);
          }
        }

        const eligibleBySource = new Map<string, typeof candidates>();
        for (const s of sources) {
          const matched = new Set<string>();
          if (s.productId) matched.add(s.productId);
          const bc = s.product?.barcode;
          if (bc) for (const pid of barcodeToProductIds.get(bc) ?? []) matched.add(pid);

          const eligible: typeof candidates = [];
          const pool = [
            ...[...matched].flatMap((pid) => byProductId.get(pid) ?? []),
            ...(linkedOf.get(s.id) ?? []).flatMap((r) => byItem.get(itemKey(r)) ?? []),
          ];
          const seen = new Set<string>();
          for (const c of pool) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            if (c.supermarket === s.supermarket) continue;
            if (s.discountedPrice - c.discountedPrice < MIN_SAVINGS) continue;
            // Like-for-like pack only — don't call a 12-pack "cheaper" than a single.
            if (!samePack(s.productName, c.productName)) continue;
            // Mis-mapped productIds join different products — never claim a
            // DIFFERENT product is "the same thing, cheaper elsewhere".
            eligible.push(c);
          }
          eligibleBySource.set(s.id, eligible);
        }

        // AI verdicts (lib/comparison-verdict): «the same thing, cheaper
        // elsewhere» is a comparison claim too — one query for every source.
        // Keyed by each chain's item code (its «slot»).
        // Generic so filterByVerdict keeps the full candidate type (price etc.).
        const sideOf = <D extends { supermarket: string; chainItemcode: string | null; productName: string }>(d: D) =>
          ({ chain: d.supermarket, code: d.chainItemcode, name: d.productName });
        const verdictOf = await loadVerdictLookup(
          prisma,
          sources.flatMap((s) => (eligibleBySource.get(s.id) ?? []).map((c) =>
            pairKeyOf(sideOf(s), sideOf(c)))),
        );

        const out: Record<string, CheaperAlternative | null> = {};
        for (const s of sources) {
          const vetted = filterByVerdict(sideOf(s), eligibleBySource.get(s.id) ?? [], sideOf, verdictOf);
          // Apply the exact name + variant guard used by the comparison UI.
          const comparable = filterComparable(
            s.productName,
            vetted,
            (c) => c.productName,
            (c) => c.supermarket,
          );
          let best: (typeof candidates)[number] | null = null;
          for (const c of comparable) {
            if (!best || c.discountedPrice < best.discountedPrice) best = c;
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
