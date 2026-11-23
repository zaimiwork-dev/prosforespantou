'use server';

// «Ειδοποίησέ με» on the website (owner 2026-11-23): email alerts on any
// product — when it goes on offer anywhere, gets cheaper, or reaches the
// person's price. The email address is confirmed first (same double opt-in as
// the newsletter, actions/subscribe): the watch is saved now, alerts start
// once the address is confirmed (src/scripts/fire-product-watches.mjs skips
// unconfirmed emails).
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendConfirmationEmail } from '@/lib/email';
import { saveWatch } from '@/lib/product-watches';

const Input = z.object({
  email: z.string().email().max(254),
  offerId: z.string().uuid(),
  onOffer: z.boolean(),
  onDrop: z.boolean(),
  targetPrice: z.number().positive().max(10000).nullable(),
  // Honeypot: a hidden field only bots fill in.
  website: z.string().max(254).optional(),
});

export async function watchProductByEmail(input: unknown) {
  return await Sentry.withServerActionInstrumentation('watchProductByEmail', { recordResponse: false }, async () => {
    const ip = (await headers()).get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`watch-email:${ip}`, 10, 60_000)) {
      return { success: false, error: 'Πολλές προσπάθειες. Δοκίμασε σε λίγο.' };
    }
    const parsed = Input.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Έλεγξε το email και την τιμή.' };
    const d = parsed.data;
    if (d.website && d.website.trim()) return { success: true, needsConfirm: false };
    try {
      const offer = await prisma.discount.findUnique({ where: { id: d.offerId }, select: { supermarket: true, chainItemcode: true } });
      if (!offer?.chainItemcode) return { success: false, error: 'Δεν βρέθηκε το προϊόν.' };

      const email = d.email.toLowerCase().trim();
      const existing = await prisma.subscriber.findUnique({ where: { email } });
      const confirmed = Boolean(existing?.confirmedAt && !existing.unsubscribedAt);
      const sub = existing ?? await prisma.subscriber.create({ data: { email, source: 'product_watch', preferredStores: [] } });
      if (existing?.unsubscribedAt) {
        // Asking for an alert again is a new opt-in: confirm the address again.
        await prisma.subscriber.update({ where: { id: existing.id }, data: { unsubscribedAt: null, confirmedAt: null } });
      }

      const res = await saveWatch(prisma as never, { subscriberId: sub.id }, {
        chain: offer.supermarket,
        code: offer.chainItemcode,
        onOffer: d.onOffer,
        onDrop: d.onDrop,
        targetPrice: d.targetPrice ?? null,
      });
      if (!res.ok) {
        return { success: false, error: res.error === 'too many watches' ? 'Έχεις φτάσει το όριο των ειδοποιήσεων.' : 'Διάλεξε τουλάχιστον ένα.' };
      }
      if (!confirmed) await sendConfirmationEmail(sub.email, sub.confirmToken, sub.unsubToken);
      return { success: true, needsConfirm: !confirmed };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.' };
    }
  });
}
