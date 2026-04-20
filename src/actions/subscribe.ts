'use server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';

const schema = z.object({
  email: z.string().email().max(254),
  source: z.string().max(64).optional(),
  preferredStores: z.array(z.string()).optional(),
});

export async function subscribe(input: unknown) {
  return await Sentry.withServerActionInstrumentation('subscribe', { recordResponse: false }, async () => {
    try {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'Μη έγκυρο email' };

      const email = parsed.data.email.toLowerCase().trim();
      const existing = await prisma.subscriber.findUnique({ where: { email } });

      if (existing && existing.confirmedAt && !existing.unsubscribedAt) {
        return { success: true, alreadyConfirmed: true };
      }

      const sub = await prisma.subscriber.upsert({
        where: { email },
        update: {
          source: parsed.data.source,
          preferredStores: parsed.data.preferredStores ?? [],
          unsubscribedAt: null,
        },
        create: {
          email,
          source: parsed.data.source,
          preferredStores: parsed.data.preferredStores ?? [],
        },
      });

      // TODO: send confirmation email via Resend/Postmark/SES using sub.confirmToken.
      console.log(`Confirmation URL: ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/subscribe/confirm?token=${sub.confirmToken}`);

      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Κάτι πήγε στραβά' };
    }
  });
}

export async function confirmSubscription(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  if (!token) redirect('/subscribe/confirm');
  try {
    await prisma.subscriber.update({
      where: { confirmToken: token },
      data: { confirmedAt: new Date(), unsubscribedAt: null },
    });
  } catch (error) {
    Sentry.captureException(error);
    redirect(`/subscribe/confirm?token=${encodeURIComponent(token)}`);
  }
  redirect(`/subscribe/confirm?token=${encodeURIComponent(token)}&done=1`);
}

export async function unsubscribe(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  if (!token) redirect('/subscribe/unsubscribe');
  try {
    await prisma.subscriber.update({
      where: { unsubToken: token },
      data: { unsubscribedAt: new Date() },
    });
  } catch (error) {
    Sentry.captureException(error);
    redirect(`/subscribe/unsubscribe?token=${encodeURIComponent(token)}`);
  }
  redirect(`/subscribe/unsubscribe?token=${encodeURIComponent(token)}&done=1`);
}
