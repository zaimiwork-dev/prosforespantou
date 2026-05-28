'use server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { checkRateLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';
import { sendConfirmationEmail } from '@/lib/email';

const schema = z.object({
  email: z.string().email().max(254),
  source: z.string().max(64).optional(),
  preferredStores: z.array(z.string()).optional(),
  // Honeypot — hidden input. Bots auto-fill it; humans never see it.
  // Non-empty value = silent fake-success, no DB write.
  website: z.string().max(254).optional(),
});

export async function subscribe(input: unknown) {
  return await Sentry.withServerActionInstrumentation('subscribe', { recordResponse: false }, async () => {
    try {
      const ip = (await headers()).get('x-forwarded-for') || 'unknown';
      if (!checkRateLimit(`subscribe:${ip}`, 5, 60_000)) {
        return { success: false, rateLimited: true, error: 'Πολλές προσπάθειες' };
      }

      const parsed = schema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'Μη έγκυρο email' };

      // Bot tripped the honeypot — fake-success so it stops retrying. No row written.
      if (parsed.data.website && parsed.data.website.trim().length > 0) {
        return { success: true, emailSent: false };
      }

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

      // Send via Resend if configured; falls back to console.log otherwise so
      // local dev still works without an API key.
      const r = await sendConfirmationEmail(sub.email, sub.confirmToken, sub.unsubToken);
      return { success: true, emailSent: r.ok };
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
