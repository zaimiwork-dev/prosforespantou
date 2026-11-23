// DELETE /api/v1/devices/:id/watches/:watchId — stop watching (only the
// device's own watches can be removed).
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { removeWatch } from '@/lib/product-watches';
import { ok, fail, rateLimited, preflight } from '@/lib/api/respond';

const Id = z.string().uuid();

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; watchId: string }> }) {
  if (rateLimited(req, 'watches', 60)) return fail(429, 'too many requests');
  const { id, watchId } = await ctx.params;
  if (!Id.safeParse(id).success || !Id.safeParse(watchId).success) return fail(400, 'invalid id');
  try {
    const removed = await removeWatch(prisma as never, { deviceId: id }, watchId);
    return removed ? ok({ ok: true }, null) : fail(404, 'unknown watch');
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'watches unavailable');
  }
}

export const OPTIONS = preflight;
