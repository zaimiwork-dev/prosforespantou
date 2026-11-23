// GET  /api/v1/devices/:id/watches — the phone's «Ειδοποίησέ με» watches, each
//      with the best price we can prove right now (lib/product-watches).
// POST /api/v1/devices/:id/watches {chain, code, onOffer, onDrop, targetPrice}
//      — start (or change) watching a store item, on offer or not.
// Personal data: never cached.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { listWatches, saveWatch, type WatchInput } from '@/lib/product-watches';
import { ok, fail, rateLimited } from '@/lib/api/respond';

const Id = z.string().uuid();
const Body = z.object({
  chain: z.string().regex(/^[a-z]{2,20}$/),
  code: z.string().min(1).max(64),
  onOffer: z.boolean(),
  onDrop: z.boolean(),
  targetPrice: z.number().positive().max(10000).nullable(),
});

async function device(id: string) {
  if (!Id.safeParse(id).success) return null;
  return prisma.appDevice.findUnique({ where: { id }, select: { id: true } });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, 'watches', 120)) return fail(429, 'too many requests');
  const { id } = await ctx.params;
  try {
    if (!(await device(id))) return fail(404, 'unknown device');
    return ok({ watches: await listWatches(prisma as never, { deviceId: id }) }, null);
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'watches unavailable');
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, 'watches', 60)) return fail(429, 'too many requests');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');
  try {
    if (!(await device(id))) return fail(404, 'unknown device');
    // Zod has checked every field (the project's non-strict tsconfig types them optional).
    const res = await saveWatch(prisma as never, { deviceId: id }, parsed.data as WatchInput);
    if (!res.ok) return fail(res.error === 'unknown item' ? 404 : 400, res.error);
    return ok({ watch: res.watch }, null);
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'watches unavailable');
  }
}
