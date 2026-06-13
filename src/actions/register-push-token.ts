'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

const InputSchema = z.object({
  token: z.string().min(10).max(512),
  platform: z.enum(['ios', 'android', 'web']),
});

// Store a native push token for the logged-in user — the delivery channel for
// watch-list push alerts (Capacitor). Foundation, gated like the rest of the
// account stack: PushToken.userId is NOT NULL and an alert needs an identity to
// reach, so without a session this is a graceful no-op. It lights up once login
// is active (AUTH_SECRET + a provider) and FCM/APNs are configured natively.
export async function registerPushToken(rawInput: unknown) {
  return await Sentry.withServerActionInstrumentation('registerPushToken', { recordResponse: false }, async () => {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: 'invalid input' };

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: 'no session' };

    const { token, platform } = parsed.data;
    try {
      await prisma.pushToken.upsert({
        where: { token },
        update: { userId, platform, lastSeenAt: new Date() },
        create: { token, platform, userId },
      });
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'db error' };
    }
  });
}
