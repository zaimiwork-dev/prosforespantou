'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import * as Sentry from "@sentry/nextjs";
import { SUPERMARKETS } from '@/lib/constants';

const leafletSchema = z.object({
  supermarket: z.string().min(1),
  title: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  pdfUrl: z.string().url().optional(),
  pageImages: z.array(z.string().url()).optional(),
  autoDeleteDays: z.number().int().positive().nullable().optional(),
});

export async function pruneExpiredDatelessLeaflets() {
  const candidates = await prisma.leaflet.findMany({
    where: {
      validFrom: null,
      autoDeleteDays: { not: null },
    },
    select: { id: true, createdAt: true, autoDeleteDays: true },
  });
  const now = Date.now();
  const toDelete = candidates
    .filter((l) => l.autoDeleteDays && l.createdAt.getTime() + l.autoDeleteDays * 86400000 < now)
    .map((l) => l.id);
  if (toDelete.length > 0) {
    await prisma.leaflet.deleteMany({ where: { id: { in: toDelete } } });
  }
}

export async function createLeaflet(input) {
  return await Sentry.withServerActionInstrumentation('createLeaflet', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = leafletSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
      }

      const { supermarket, title, validFrom, validUntil, pdfUrl, pageImages, autoDeleteDays } = parsed.data;

      const smDef = SUPERMARKETS.find((s) => s.id === supermarket);
      const storeName = smDef?.name ?? supermarket;

      const store = await prisma.store.upsert({
        where: { name: storeName },
        update: {},
        create: { name: storeName },
      });

      const leaflet = await prisma.leaflet.create({
        data: {
          title,
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          pdfUrl,
          pageImages: pageImages ?? [],
          autoDeleteDays: validFrom ? null : (autoDeleteDays ?? null),
          storeId: store.id
        }
      });

      revalidateTag('leaflets', 'max');
      return { success: true, id: leaflet.id };
    } catch (error) {
      Sentry.captureException(error);
      console.error('createLeaflet failed:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}

export async function listLeaflets() {
  return await Sentry.withServerActionInstrumentation('listLeaflets', { recordResponse: true }, async () => {
    try {
      await requireAdmin();
      await pruneExpiredDatelessLeaflets();
      const leaflets = await prisma.leaflet.findMany({
        orderBy: { createdAt: 'desc' },
        include: { store: { select: { name: true } } },
        take: 100,
      });
      return {
        success: true,
        leaflets: leaflets.map((l) => ({
          id: l.id,
          title: l.title,
          storeName: l.store?.name ?? '',
          validFrom: l.validFrom?.toISOString() ?? null,
          validUntil: l.validUntil?.toISOString() ?? null,
          pdfUrl: l.pdfUrl,
          createdAt: l.createdAt.toISOString(),
          autoDeleteDays: l.autoDeleteDays,
        })),
      };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error', leaflets: [] };
    }
  });
}

export async function deleteLeaflet(id) {
  return await Sentry.withServerActionInstrumentation('deleteLeaflet', { recordResponse: true }, async () => {
    try {
      await requireAdmin();
      await prisma.leaflet.delete({ where: { id } });
      revalidateTag('leaflets', 'max');
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
