// POST /api/v1/devices {platform} → {deviceId}
// A phone with the app registers once (no login) to keep «Ειδοποίησέ με»
// watches. The returned id is the device's own secret: the app stores it and
// sends it to manage its watches and to add its push token later
// (PATCH /api/v1/devices/:id). Owner decision 2026-11-23.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, fail, rateLimited, preflight } from '@/lib/api/respond';

const Body = z.object({ platform: z.enum(['android', 'ios', 'web']) });

export async function POST(req: Request) {
  if (rateLimited(req, 'devices', 20)) return fail(429, 'too many requests');
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');
  try {
    const device = await prisma.appDevice.create({ data: { platform: parsed.data.platform }, select: { id: true } });
    return ok({ deviceId: device.id }, null);
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'device unavailable');
  }
}

export const OPTIONS = preflight;
