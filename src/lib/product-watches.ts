// «Ειδοποίησέ με» storage (owner 2026-11-23): create, list and remove product
// watches for a phone (AppDevice) or an email (Subscriber). Shared by the app
// API (/api/v1/devices/…) and the website's actions, so both behave the same.
// The nightly check is src/scripts/fire-product-watches.mjs (rules in
// lib/watch-alerts).
import { loadItemPrices, type ListPricesReader } from './list-prices.ts';
import { lowest, type PricePoint, type WatchView } from './watch-alerts.ts';

type Owner = { deviceId: string } | { subscriberId: string };

export type WatchInput = {
  chain: string;
  code: string;
  onOffer: boolean;
  onDrop: boolean;
  targetPrice: number | null;
};

export type { WatchView };

// A person watching hundreds of products is a bot or a bug.
export const MAX_WATCHES = 200;

type Reader = ListPricesReader & {
  productWatch: {
    findMany(args: any): Promise<any[]>;
    count(args: any): Promise<number>;
    upsert(args: any): Promise<any>;
    deleteMany(args: any): Promise<{ count: number }>;
  };
};

const ownerWhere = (o: Owner) => ('deviceId' in o ? { deviceId: o.deviceId } : { subscriberId: o.subscriberId });
const num = (d: unknown) => (d == null ? null : Number(d));

// Plain shape (not a union): the project's non-strict tsconfig cannot narrow one.
export type SaveWatchResult = { ok: boolean; watch: WatchView | null; error: string | null };

export async function saveWatch(prisma: Reader, owner: Owner, input: WatchInput): Promise<SaveWatchResult> {
  if (!input.onOffer && !input.onDrop && input.targetPrice == null) return { ok: false, watch: null, error: 'nothing to watch' };
  const key = `${input.chain}#${input.code}`;
  const prices = await loadItemPrices(prisma, [{ chain: input.chain, code: input.code }]);
  const item = prices[key];
  if (!item) return { ok: false, watch: null, error: 'unknown item' };
  const existing = await prisma.productWatch.count({ where: { ...ownerWhere(owner), isActive: true } });
  if (existing >= MAX_WATCHES) return { ok: false, watch: null, error: 'too many watches' };
  const best = lowest(item.points);
  const uniqueKey = 'deviceId' in owner
    ? { deviceId_chain_chainItemcode: { deviceId: owner.deviceId, chain: input.chain, chainItemcode: input.code } }
    : { subscriberId_chain_chainItemcode: { subscriberId: owner.subscriberId, chain: input.chain, chainItemcode: input.code } };
  const data = { onOffer: input.onOffer, onDrop: input.onDrop, targetPrice: input.targetPrice, isActive: true };
  const row = await prisma.productWatch.upsert({
    where: uniqueKey,
    create: {
      ...ownerWhere(owner),
      chain: input.chain,
      chainItemcode: input.code,
      productId: item.productId,
      name: item.name,
      startPrice: best?.price ?? null,
      // Offers on screen when they start watching are not news to them.
      notifiedOfferIds: item.points.filter((p) => p.kind === 'offer' && p.offerId).map((p) => p.offerId),
      ...data,
    },
    update: data,
  });
  return { ok: true, watch: toView(row, item.points), error: null };
}

export async function listWatches(prisma: Reader, owner: Owner): Promise<WatchView[]> {
  const rows = await prisma.productWatch.findMany({
    where: { ...ownerWhere(owner), isActive: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_WATCHES,
  });
  if (rows.length === 0) return [];
  const prices = await loadItemPrices(prisma, rows.map((r) => ({ chain: r.chain, code: r.chainItemcode })));
  return rows.map((r) => toView(r, prices[`${r.chain}#${r.chainItemcode}`]?.points ?? []));
}

export async function removeWatch(prisma: Reader, owner: Owner, watchId: string): Promise<boolean> {
  const res = await prisma.productWatch.deleteMany({ where: { id: watchId, ...ownerWhere(owner) } });
  return res.count > 0;
}

function toView(r: any, points: PricePoint[]): WatchView {
  const best = lowest(points);
  return {
    id: r.id,
    chain: r.chain,
    code: r.chainItemcode,
    name: r.name,
    onOffer: r.onOffer,
    onDrop: r.onDrop,
    targetPrice: num(r.targetPrice),
    startPrice: num(r.startPrice),
    now: best ? { chain: best.chain, price: best.price, kind: best.kind, offerId: best.offerId ?? null } : null,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}
