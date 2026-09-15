'use server';

import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';
import { syncProfileSchema, deleteProfileSchema } from '@/lib/validations/profile';

// Anonymous server-side profile (W4a). The client (lib/profile-sync.js) sends a
// bounded snapshot of what the shopper set on this device, debounced and only
// when it changed, and only after cookie consent. Write-only on purpose: there
// is no read action, so a profile id reveals nothing even if it leaked. The
// personal feed (W4b) will read it server-side.
//
// OFF unless NEXT_PUBLIC_PROFILE_SYNC=1: the published privacy policy says
// preferences stay on the device. Flip the flag together with the privacy text
// that the same flag switches on (owner decision #7).
export async function syncProfile(input: unknown) {
  return await Sentry.withServerActionInstrumentation('syncProfile', { recordResponse: false }, async () => {
    try {
      if (process.env.NEXT_PUBLIC_PROFILE_SYNC !== '1') return { success: false, error: 'disabled' };

      const parsed = syncProfileSchema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'invalid' };

      const h = await headers();
      const ip = h.get('x-forwarded-for') || 'unknown';
      // The client debounces to one call per few seconds of changes.
      if (!checkRateLimit(`profile:${ip}`, 12, 60_000)) {
        return { success: false, error: 'rate_limited' };
      }

      const { profileId, ...snap } = parsed.data;
      const data = {
        preferredStores: snap.preferredStores,
        preferredCategories: snap.preferredCategories,
        favorites: snap.favorites,
        listItems: snap.listItems,
        interests: snap.interests,
        textSize: snap.textSize,
      };
      await prisma.profile.upsert({
        where: { id: profileId },
        create: { id: profileId, ...data },
        update: data,
      });
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'server' };
    }
  });
}

// Erasure: runs when the shopper withdraws consent. Always allowed, flag or not
// — a copy made while the flag was on must still be deletable after it is off.
export async function deleteProfile(input: unknown) {
  return await Sentry.withServerActionInstrumentation('deleteProfile', { recordResponse: false }, async () => {
    try {
      const parsed = deleteProfileSchema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'invalid' };

      const h = await headers();
      const ip = h.get('x-forwarded-for') || 'unknown';
      if (!checkRateLimit(`profile-del:${ip}`, 10, 60_000)) {
        return { success: false, error: 'rate_limited' };
      }

      const { count } = await prisma.profile.deleteMany({ where: { id: parsed.data.profileId } });
      return { success: true, deleted: count };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'server' };
    }
  });
}
