// GET  /api/v1/devices/:id/watches — the phone's «Ειδοποίησέ με» watches, each
//      with the best price we can prove right now (lib/product-watches).
// POST /api/v1/devices/:id/watches — start (or change) watching a store item,
//      on offer or not: {chain, code} or {offerId} (the item that offer is
//      for), plus {onOffer, onDrop, targetPrice}.
// Personal data: never cached.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { listWatches, saveWatch, type WatchInput } from '@/lib/product-watches';
import { ok, fail, rateLimited, preflight } from '@/lib/api/respond';

const Id = z.string().uuid();
const Body = z.object({
  chain: z.string().regex(/^[a-z]{2,20}$/).optional(),
  code: z.string().min(1).max(64).optional(),
  offerId: z.string().uuid().optional(),
  onOffer: z.boolean(),
  onDrop: z.boolean(),
  targetPrice: z.number().positive().max(10000).nullable(),
}).refine((b) => Boolean(b.offerId) || Boolean(b.chain && b.code), { message: 'chain+code or offerId' });

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
    const b = parsed.data;
    let chain = b.chain;
    let code = b.code;
    if (b.offerId) {
      const offer = await prisma.discount.findUnique({ where: { id: b.offerId }, select: { supermarket: true, chainItemcode: true } });
      if (!offer?.chainItemcode) return fail(404, 'unknown item');
      chain = offer.supermarket;
      code = offer.chainItemcode;
    }
    // Zod has checked every field (the project's non-strict tsconfig types them optional).
    const input: WatchInput = { chain, code, onOffer: b.onOffer, onDrop: b.onDrop, targetPrice: b.targetPrice ?? null };
    const res = await saveWatch(prisma as never, { deviceId: id }, input);
    if (!res.ok) return fail(res.error === 'unknown item' ? 404 : 400, res.error);
    return ok({ watch: res.watch }, null);
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'watches unavailable');
  }
}

export const OPTIONS = preflight;
