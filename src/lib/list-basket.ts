// «Where is my whole list cheapest?» — the shopping list priced at every chain.
//
// Pure and shared: the website (components/ShoppingList.js) and the app
// (mobile, via `@shared/list-basket`) render the same sentences from the same
// numbers. Keep it free of imports.
//
// The prices come from lib/list-prices.ts = the rows each item's comparison
// sheet shows (an offer at another chain, or that chain's regular shelf
// price), so the list never claims a price the product page would not show.
//
// Honesty rules (owner, 2026-11-22: «price and product is everything»):
// - A chain is only compared on the items we KNOW a price for there. A chain
//   with 4 of 6 items is never totalled against the full list: its row says
//   «4 από τα 6» and compares those 4 with what the same 4 cost on the list.
// - «Όλη η λίστα» is claimed only for a chain with a price for EVERY item.
// - An item whose offer has ended is left out: its price can no longer be paid.

export type BasketItem = {
  id: string;
  chain: string | null;
  // The price the list shows for one unit (what the shopper saw when adding).
  price: number;
  quantity: number;
};

export type ChainPrice = {
  chain: string;
  price: number;
  // 'offer' = a live offer at that chain; 'shelf' = its regular price.
  kind: 'offer' | 'shelf';
  offerId?: string | null;
};

// Per list item, from the server (lib/list-prices).
export type ItemPrices = {
  chain: string | null;
  price: number;
  live: boolean;
  elsewhere: ChainPrice[];
};

export type ChainBasket = {
  chain: string;
  // List items with a known price at this chain (its own items included).
  found: number;
  // What those items cost at this chain, quantities included.
  cost: number;
  // What the same items cost on the list as it is now.
  listCost: number;
  // How many of them sit on the list at ANOTHER chain now.
  moved: number;
};

export type BasketComparison = {
  // Items compared (still on offer, priced).
  items: number;
  // Of those, how many have a price at another chain.
  compared: number;
  listTotal: number;
  // Chains with a price for at least one item that is on the list elsewhere —
  // all items first, then most items, then the biggest saving.
  chains: ChainBasket[];
  // The cheapest chain with a price for EVERY item, if another chain than the
  // list's only one has them all (otherwise there is nothing to compare).
  whole: ChainBasket | null;
};

const CENT = 0.005;
// A saving worth a trip: the headline names a cheaper chain, and an item gets
// its «Πιο φθηνά στο …» tag (cheaperElsewhere), only from this much. A smaller
// difference still shows in that chain's row. (The old 10-cent floor of
// actions/get-cheaper-alternatives, which this file replaced on 2026-11-23.)
export const MIN_LIST_SAVING = 0.10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function compareBasket(items: BasketItem[], prices: Record<string, ItemPrices | undefined>): BasketComparison {
  const live = items.filter((i) => {
    const p = prices[i.id];
    return p && p.live && Number.isFinite(i.price) && i.price > 0 && i.quantity > 0;
  });

  const byChain = new Map<string, ChainBasket>();
  let compared = 0;
  let listTotal = 0;
  for (const item of live) {
    const p = prices[item.id]!;
    const qty = item.quantity;
    const listCost = item.price * qty;
    listTotal += listCost;

    // One price per chain: the item's own chain at the list price, every
    // other chain at the cheapest row its comparison sheet shows.
    const at = new Map<string, number>();
    if (item.chain) at.set(item.chain, item.price);
    for (const e of p.elsewhere) {
      if (!e.chain || e.chain === item.chain || !Number.isFinite(e.price) || e.price <= 0) continue;
      const prev = at.get(e.chain);
      if (prev == null || e.price < prev) at.set(e.chain, e.price);
    }
    if ([...at.keys()].some((c) => c !== item.chain)) compared++;

    for (const [chain, price] of at) {
      let b = byChain.get(chain);
      if (!b) {
        b = { chain, found: 0, cost: 0, listCost: 0, moved: 0 };
        byChain.set(chain, b);
      }
      b.found++;
      b.cost += price * qty;
      b.listCost += listCost;
      if (chain !== item.chain) b.moved++;
    }
  }

  const all = [...byChain.values()].map((b) => ({ ...b, cost: round2(b.cost), listCost: round2(b.listCost) }));
  const n = live.length;
  const chains = all
    .filter((b) => b.moved > 0)
    .sort((a, b) =>
      (Number(b.found === n) - Number(a.found === n)) ||
      (b.found - a.found) ||
      ((a.cost - a.listCost) - (b.cost - b.listCost)) ||
      a.chain.localeCompare(b.chain));

  // «Όλη η λίστα»: among chains with every item, the cheapest — but only when
  // at least one of them is not simply where the whole list already is.
  const complete = all.filter((b) => b.found === n).sort((a, b) => a.cost - b.cost);
  const whole = n > 0 && complete.some((b) => b.moved > 0) ? complete[0] : null;

  return { items: n, compared, listTotal: round2(listTotal), chains, whole };
}

export type CheaperElsewhere = {
  chain: string;
  price: number;
  kind: 'offer' | 'shelf';
  offerId: string | null;
  // Per unit: the list price minus the price there.
  savings: number;
};

// «Πιο φθηνά στο …» on one list item: the cheapest row its comparison sheet
// shows at another chain (offer or regular shelf price), when it saves at
// least MIN_LIST_SAVING a unit. Same prices as the card above, so the tag on
// an item and the chain rows can never disagree.
export function cheaperElsewhere(item: BasketItem, p: ItemPrices | undefined, min = MIN_LIST_SAVING): CheaperElsewhere | null {
  if (!p || !p.live || !Number.isFinite(item.price) || item.price <= 0) return null;
  let best: ChainPrice | null = null;
  for (const e of p.elsewhere) {
    if (!e.chain || e.chain === item.chain || !Number.isFinite(e.price) || e.price <= 0) continue;
    // On a tie, an offer (a page to open) beats a shelf price.
    if (!best || e.price < best.price || (e.price === best.price && e.kind === 'offer' && best.kind === 'shelf')) best = e;
  }
  if (!best) return null;
  const savings = round2(item.price - best.price);
  if (savings < min - CENT) return null;
  return { chain: best.chain, price: best.price, kind: best.kind, offerId: best.offerId ?? null, savings };
}

// «στον Σκλαβενίτη», «στα Lidl», «στο My Market»: Greek puts an article
// after «σε», and a bare «στο Σκλαβενίτης» reads as machine text.
const AT_CHAIN: Record<string, string> = {
  ab: 'στον AB',
  sklavenitis: 'στον Σκλαβενίτη',
  masoutis: 'στον Μασούτη',
  kritikos: 'στον Κρητικό',
  galaxias: 'στον Γαλαξία',
  lidl: 'στα Lidl',
};
export const atChain = (chain: string, name: string) => AT_CHAIN[chain] ?? `στο ${name}`;

// Greek sentences, shared by site and app. `fmt` = the caller's price format
// («12,40 €»); `nameOf` = the chain's display name.
export type BasketText = {
  // One plain sentence at the top of the card; null = show no card.
  lead: string | null;
  rows: { chain: string; label: string; detail: string; tone: 'cheaper' | 'dearer' | 'same' }[];
  note: string;
};

export function basketText(
  c: BasketComparison,
  fmt: (n: number) => string,
  nameOf: (chain: string) => string,
): BasketText {
  const note = 'Συγκρίνουμε μόνο τα προϊόντα που βρήκαμε σε κάθε κατάστημα, με τις ίδιες ποσότητες.';
  if (c.compared === 0 || c.chains.length === 0) return { lead: null, rows: [], note };

  let lead: string;
  const w = c.whole;
  if (w && w.moved > 0 && w.cost <= c.listTotal - MIN_LIST_SAVING + CENT) {
    lead = `Όλη η λίστα κοστίζει λιγότερο ${atChain(w.chain, nameOf(w.chain))}: ${fmt(w.cost)} αντί ${fmt(c.listTotal)}.`;
  } else if (w && w.moved === 0 && c.chains.filter((b) => b.found === c.items).every((b) => b.cost > w.cost + CENT)) {
    // Strictly cheaper than every other chain with the whole list — a tie is
    // not «the cheapest».
    lead = 'Όλη η λίστα σου είναι ήδη στο φθηνότερο κατάστημα.';
  } else if (c.compared === c.items) {
    lead = c.items === 1
      ? 'Βρήκαμε το προϊόν σου και σε άλλα καταστήματα.'
      : `Βρήκαμε και τα ${c.items} προϊόντα σου σε άλλα καταστήματα.`;
  } else {
    lead = `Βρήκαμε ${c.compared} από τα ${c.items} προϊόντα σου και σε άλλα καταστήματα.`;
  }

  const rows = c.chains.map((b) => {
    const diff = round2(b.cost - b.listCost);
    const tone: 'cheaper' | 'dearer' | 'same' = diff < -CENT ? 'cheaper' : diff > CENT ? 'dearer' : 'same';
    const what = b.found === c.items
      ? (c.items === 1 ? 'Το προϊόν σου' : 'Όλα τα προϊόντα σου')
      : `${b.found} από τα ${c.items} προϊόντα σου`;
    const detail = tone === 'cheaper'
      ? `${fmt(-diff)} λιγότερα από τώρα`
      : tone === 'dearer'
        ? `${fmt(diff)} περισσότερα από τώρα`
        : 'ίδια τιμή με τώρα';
    return { chain: b.chain, label: `${what}: ${fmt(b.cost)}`, detail, tone };
  });

  return { lead, rows, note };
}
