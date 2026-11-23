// PATCH /api/v1/devices/:id {pushToken} — the phone's Expo push token, once
// the person allows notifications (null = they turned them off). A token can
// belong to one device only: after a reinstall the new device takes it over.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, fail, rateLimited, preflight } from '@/lib/api/respond';

const Id = z.string().uuid();
const Body = z.object({
  pushToken: z.string().regex(/^Expo(nent)?PushToken\[[^\]]{10,200}\]$/).nullable(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, 'devices', 60)) return fail(429, 'too many requests');
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return fail(400, 'invalid id');
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');
  try {
    const device = await prisma.appDevice.findUnique({ where: { id }, select: { id: true } });
    if (!device) return fail(404, 'unknown device');
    const token = parsed.data.pushToken;
    await prisma.$transaction([
      ...(token ? [prisma.appDevice.updateMany({ where: { pushToken: token, NOT: { id } }, data: { pushToken: null } })] : []),
      prisma.appDevice.update({ where: { id }, data: { pushToken: token, disabledAt: null, lastSeenAt: new Date() } }),
    ]);
    return ok({ ok: true }, null);
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'device unavailable');
  }
}

export const OPTIONS = preflight;
