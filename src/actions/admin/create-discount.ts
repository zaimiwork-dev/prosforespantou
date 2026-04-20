'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import { discountInputSchema } from '@/lib/validations/discount-input';
import * as Sentry from "@sentry/nextjs";

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

const normalizeString = (s: string) => 
  s.toLowerCase()
   .normalize('NFD')
   .replace(/\p{Diacritic}/gu, '')
   .trim();

async function fireAlertsFor(discount: any) {
  const name = normalizeString(discount.productName);
  const alerts = await prisma.alert.findMany({
    where: { 
      isActive: true, 
      subscriber: { 
        confirmedAt: { not: null }, 
        unsubscribedAt: null 
      } 
    },
    include: { subscriber: true },
  });

  const matched = alerts.filter((a) => {
    if (!name.includes(normalizeString(a.keyword))) return false;
    if (a.supermarkets.length && !a.supermarkets.includes(discount.supermarket)) return false;
    if (a.category && a.category !== discount.category) return false;
    if (a.maxPrice && Number(discount.discountedPrice) > Number(a.maxPrice)) return false;
    
    const now = Date.now();
    const recently = a.lastTriggeredAt && (now - a.lastTriggeredAt.getTime()) < 6 * 3600000;
    if (recently) return false;
    
    return true;
  });

  for (const a of matched) {
    // console.log(`Alert triggered for ${a.subscriber.email}: ${discount.productName}`);
    await prisma.alert.update({ 
      where: { id: a.id }, 
      data: { lastTriggeredAt: new Date() } 
    });
  }
}

export async function createDiscount(input: unknown) {
  return await Sentry.withServerActionInstrumentation('createDiscount', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = discountInputSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
      }

      const data = parsed.data;
      const storeName = SM_MAPPING[data.supermarket];
      if (!storeName) {
        return { success: false, error: 'Unknown supermarket' };
      }

      const store = await prisma.store.upsert({
        where: { name: storeName },
        update: {},
        create: { name: storeName },
      });

      const rawInput = input as { valid_from?: string | null; valid_until?: string | null };
      const datesMissing = !rawInput.valid_from && !rawInput.valid_until;

      let leafletId: string | null = null;
      let validFrom = data.validFrom;
      let validUntil = data.validUntil;

      if (datesMissing) {
        const now = new Date();
        const activeLeaflet = await prisma.leaflet.findFirst({
          where: {
            storeId: store.id,
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          },
          orderBy: { createdAt: 'desc' },
        });
        if (activeLeaflet) {
          leafletId = activeLeaflet.id;
          if (activeLeaflet.validFrom) validFrom = activeLeaflet.validFrom;
          if (activeLeaflet.validUntil) validUntil = activeLeaflet.validUntil;
        }
      }

      const created = await prisma.discount.create({
        data: {
          storeId: store.id,
          supermarket: data.supermarket,
          productName: data.productName,
          category: data.category,
          originalPrice: data.originalPrice,
          discountedPrice: data.discountedPrice,
          discountPercent: data.discountPercent,
          description: data.description,
          validFrom,
          validUntil,
          leafletId,
          imageUrl: data.imageUrl,
          isActive: data.isActive,
          isFeatured: data.isFeatured,
          featuredUntil: data.featuredUntil,
          featuredLabel: data.featuredLabel,
        },
      });

      fireAlertsFor(created).catch(() => {});

      revalidateTag('deals:default', 'max');
      return { success: true, id: created.id };
    } catch (error) {
      Sentry.captureException(error);
      console.error('createDiscount failed:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
