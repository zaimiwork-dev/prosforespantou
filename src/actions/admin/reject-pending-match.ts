'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';

const inputSchema = z.object({ pendingMatchId: z.string().uuid() });

export async function rejectPendingMatch(input: unknown) {
  return await Sentry.withServerActionInstrumentation('rejectPendingMatch', { recordResponse: true }, async () => {
    try {
      await requireAdmin();
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'Invalid input' };

      await prisma.pendingMatch.delete({ where: { id: parsed.data.pendingMatchId } });
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error' };
    }
  });
}
