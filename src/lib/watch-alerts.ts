// «Ειδοποίησέ με» (owner 2026-11-23): when does a watched product alert?
// Pure — the nightly job (src/scripts/fire-product-watches.mjs) loads the
// prices, asks this module, sends, and stores the returned state.
//
// The owner chose three triggers, any combination per watch:
//   onOffer      — it goes on offer at ANY store (the item itself, or the same
//                  product at another store: barcode / checked link)
//   onDrop       — its lowest price across stores falls below where it was
//                  when they started watching (and below the last alert)
//   targetPrice  — its lowest price reaches the person's own price
// Never twice for the same thing: an offer alerts once (notifiedOfferIds), a
// price alerts once per new low (lastNotifiedPrice), and at most one message
// per watch per COOLDOWN so a busy week does not become spam.

export type WatchState = {
  onOffer: boolean;
  onDrop: boolean;
  targetPrice: number | null;
  startPrice: number | null;
  lastNotifiedAt: Date | null;
  lastNotifiedPrice: number | null;
  notifiedOfferIds: string[];
};

// What the product costs right now at every store we can prove sells it.
export type PricePoint = {
  chain: string;
  price: number;
  kind: 'offer' | 'shelf';
  offerId?: string | null;
};

export type WatchAlert = {
  reason: 'target' | 'offer' | 'drop';
  chain: string;
  price: number;
  offerId: string | null;
  // For the message: the price it is compared with.
  before: number | null;
};

// One watch as the app and the website show it (lib/product-watches builds it).
export type WatchView = {
  id: string;
  chain: string;
  code: string;
  name: string;
  onOffer: boolean;
  onDrop: boolean;
  targetPrice: number | null;
  startPrice: number | null;
  // The best price we can prove right now, and where.
  now: { chain: string; price: number; kind: 'offer' | 'shelf'; offerId: string | null } | null;
  createdAt: string;
};

export const COOLDOWN_HOURS = 20;
// A «drop» smaller than this is noise (a cent of rounding), not news.
export const MIN_DROP = 0.05;
const CENT = 0.005;

export function lowest(points: PricePoint[]): PricePoint | null {
  let best: PricePoint | null = null;
  for (const p of points) {
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    // On a tie an offer wins: it is the thing to open.
    if (!best || p.price < best.price - CENT || (Math.abs(p.price - best.price) <= CENT && p.kind === 'offer' && best.kind === 'shelf')) best = p;
  }
  return best;
}

export function decideWatchAlert(
  w: WatchState,
  points: PricePoint[],
  now: Date = new Date(),
): { alert: WatchAlert | null; next: Partial<WatchState> } {
  const best = lowest(points);
  const next: Partial<WatchState> = {};
  // First look: remember where the price started (the «drop» baseline).
  if (w.startPrice == null && best) next.startPrice = best.price;
  if (!best) return { alert: null, next };
  if (w.lastNotifiedAt && now.getTime() - w.lastNotifiedAt.getTime() < COOLDOWN_HOURS * 3600_000) return { alert: null, next };

  const floor = w.lastNotifiedPrice ?? Infinity; // only a NEW low alerts again
  let alert: WatchAlert | null = null;

  if (w.targetPrice != null && best.price <= w.targetPrice + CENT && best.price < floor - CENT) {
    alert = { reason: 'target', chain: best.chain, price: best.price, offerId: best.offerId ?? null, before: w.targetPrice };
  }
  if (!alert && w.onOffer) {
    const fresh = points
      .filter((p) => p.kind === 'offer' && p.offerId && !w.notifiedOfferIds.includes(p.offerId))
      .sort((a, b) => a.price - b.price)[0];
    if (fresh) alert = { reason: 'offer', chain: fresh.chain, price: fresh.price, offerId: fresh.offerId ?? null, before: null };
  }
  if (!alert && w.onDrop && w.startPrice != null) {
    const ref = Math.min(w.startPrice, floor);
    if (best.price <= ref - MIN_DROP) alert = { reason: 'drop', chain: best.chain, price: best.price, offerId: best.offerId ?? null, before: ref };
  }
  if (!alert) return { alert: null, next };

  next.lastNotifiedAt = now;
  next.lastNotifiedPrice = Math.min(alert.price, floor);
  // Every offer on screen now counts as told: the message names the best one,
  // and the person sees the rest on the product page.
  const offerIds = points.filter((p) => p.kind === 'offer' && p.offerId).map((p) => p.offerId as string);
  next.notifiedOfferIds = [...new Set([...w.notifiedOfferIds, ...offerIds])].slice(-50);
  return { alert, next };
}

// The notification text, shared by the app push and the email.
export function alertText(
  name: string,
  a: WatchAlert,
  fmt: (n: number) => string,
  atChainOf: (chain: string) => string,
): { title: string; body: string } {
  const where = atChainOf(a.chain);
  if (a.reason === 'target') {
    return { title: `Έπεσε στην τιμή σου: ${name}`, body: `${fmt(a.price)} ${where} (ήθελες έως ${fmt(a.before ?? a.price)}).` };
  }
  if (a.reason === 'offer') {
    return { title: `Σε προσφορά: ${name}`, body: `${fmt(a.price)} ${where}.` };
  }
  return { title: `Πιο φθηνό τώρα: ${name}`, body: `${fmt(a.price)} ${where} (ήταν ${fmt(a.before ?? a.price)}).` };
}
