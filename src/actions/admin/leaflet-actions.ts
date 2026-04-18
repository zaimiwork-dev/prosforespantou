'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import * as Sentry from "@sentry/nextjs";

const leafletSchema = z.object({
  supermarket: z.string().min(1),
  title: z.string().optional(),
  validFrom: z.string(),
  validUntil: z.string(),
  pageImages: z.array(z.string().url()),
});

export async function createLeaflet(input) {
  return await Sentry.withServerActionInstrumentation('createLeaflet', { recordResponse: true }, async () => {
    try {
      await requireAdmin();
      
      const parsed = leafletSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
      }

      const { supermarket, title, validFrom, validUntil, pageImages } = parsed.data;

      // Find store ID based on slug
      const store = await prisma.store.findFirst({
        where: { 
          OR: [
            { name: { contains: supermarket, mode: 'insensitive' } },
          ]
        }
      });

      if (!store) {
        return { success: false, error: 'Store not found' };
      }

      const leaflet = await prisma.leaflet.create({
        data: {
          title,
          validFrom: new Date(validFrom),
          validUntil: new Date(validUntil),
          pageImages,
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
