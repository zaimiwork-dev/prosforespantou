'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';

// The owner's call on a comparison pair («ίδιο προϊόν» / «διαφορετικό»).
// Stored as model = 'owner': the nightly check never re-judges or overwrites a
// row, and mergeVerdict() treats owner rows as final, so the decision sticks.
// The comparison sheets of both listings are refreshed now; the card chip
// («Τιμές σε N καταστήματα») follows at the nightly recompute.
const inputSchema = z.object({
  pairKey: z.string().regex(/^[0-9a-f]{16}$/, 'Invalid pair'),
  verdict: z.enum(['same', 'different']),
});

export async function setComparisonVerdict(input: unknown) {
  return await Sentry.withServerActionInstrumentation('setComparisonVerdict', { recordResponse: true }, async () => {
    try {
      await requireAdmin();

      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid input' };
      const { pairKey, verdict } = parsed.data;

      const row = await prisma.comparisonVerdict.findUnique({ where: { pairKey } });
      if (!row) return { success: false as const, error: 'Pair not found' };

      const day = new Date().toISOString().slice(0, 10);
      await prisma.comparisonVerdict.update({
        where: { pairKey },
        data: {
          verdict,
          model: 'owner',
          reason: `owner ${day} · was ${row.verdict} (${row.model}): ${row.reason ?? ''}`.slice(0, 400),
        },
      });

      const affected = await prisma.discount.findMany({
        where: {
          isActive: true,
          OR: [
            { supermarket: row.chainA, productName: row.nameA },
            { supermarket: row.chainB, productName: row.nameB },
          ],
        },
        select: { id: true },
      });
      for (const d of affected) revalidateTag(`offer:${d.id}`, 'max');
      revalidateTag('deals:default', 'max');

      return { success: true as const, verdict };
    } catch (error) {
      Sentry.captureException(error);
      console.error('setComparisonVerdict failed:', error);
      return { success: false as const, error: 'Internal server error' };
    }
  });
}
