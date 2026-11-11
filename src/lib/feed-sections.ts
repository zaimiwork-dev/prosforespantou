// The app's home feed (GET /api/v1/feed): an ordered list of rails, each with
// ONE reason to exist, so a shopper finds things by scrolling and not only by
// searching (owner, 2026-11-10). Pure helpers — actions/get-feed.ts owns the
// queries.
//
// Why rails with reasons instead of one "smart" ranking: on 2026-11-11 the
// site had 19 offer clicks from 5 visitors in 30 days. There is no behaviour
// to learn a ranking from, and a rail titled «Δημοφιλή» over that would be a
// lie. Every rail here is therefore defined by a fact about the offer (a real
// was-price, cheapest of the compared chains, first seen this week, a
// published end date). The one behavioural rail has an explicit data gate and
// simply does not appear until real shoppers exist.
//
// Strip-safe (no enums) and explicit .ts extensions: scripts may import it.
import { dedupeDeals } from './dedupe-deals.ts';
import { capPerFamily } from './deal-family.ts';
import { DEPT_PRIOR } from './hotness.ts';
import { baselineForCard } from './baseline-price.ts';
import { DEPARTMENTS } from './categories.ts';

export type RailRow = {
  id: string;
  supermarket: string | null;
  productName: string;
  discountedPrice: number;
  productId?: string | null;
};

// What the app needs to open «Όλες» for a rail: parameters of /api/v1/deals.
export type FeedSeeAll = { chain?: string; category?: string; sort?: string } | null;

export type FeedSection<T> = {
  id: string;
  title: string;
  subtitle: string | null;
  seeAll: FeedSeeAll;
  rows: T[];
};

export const RAIL_MIN = 4; // a rail of two cards reads as a broken screen

// A product already shown higher up must not come back in a later rail — not
// the same offer, and not the same product at a pricier chain either.
const keysOf = (d: RailRow): string[] => (d.productId ? [d.id, `p:${d.productId}`] : [d.id]);

// One rail from a ranked pool: nothing already shown, one row per product
// across chains (the cheapest), one per brand family, and no chain holding
// more than `perChain` slots — hotScore is lumpy by chain (56 % of the top 200
// were one chain on 2026-11-11, an artefact of uneven comparison coverage).
export function pickRail<T extends RailRow>(
  pool: T[],
  opts: { limit: number; seen: Set<string>; perChain?: number; perFamily?: number; min?: number },
): T[] {
  const { limit, seen } = opts;
  const perChain = opts.perChain ?? 3;
  const unseen = pool.filter((d) => !keysOf(d).some((k) => seen.has(k)));
  const ranked = capPerFamily(dedupeDeals(unseen, { crossChain: true }), opts.perFamily ?? 1);

  const used = new Map<string, number>();
  const picked: T[] = [];
  for (const d of ranked) {
    if (picked.length >= limit) break;
    const chain = d.supermarket ?? '';
    const n = used.get(chain) ?? 0;
    if (n >= perChain) continue;
    used.set(chain, n + 1);
    picked.push(d);
  }
  // The cap, not the pool, cut it short: fill with what is left rather than
  // show a half rail (a rail on one chain's page is legitimately one chain).
  if (picked.length < limit) {
    for (const d of ranked) {
      if (picked.length >= limit) break;
      if (!picked.includes(d)) picked.push(d);
    }
  }
  if (picked.length < (opts.min ?? RAIL_MIN)) return [];
  for (const d of picked) for (const k of keysOf(d)) seen.add(k);
  return picked;
}

// The saving the CARD will print for this row — a chain-published was-price,
// else the guarded «κανονικά ~X €» baseline (lib/baseline-price). Ranking the
// «Μεγάλες εκπτώσεις» rail by anything else would promise a number the card
// then does not show.
export function displayedSaving(row: {
  discountedPrice: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  baselinePrice?: number | null;
  impliedPercent?: number | null;
  baselineAt?: Date | string | null;
}): { percent: number; euros: number } | null {
  const price = row.discountedPrice;
  if (!(price > 0)) return null;
  if (row.originalPrice != null && row.originalPrice > price) {
    const percent = row.discountPercent ?? Math.round((1 - price / row.originalPrice) * 100);
    return percent > 0 ? { percent, euros: row.originalPrice - price } : null;
  }
  const baseline = baselineForCard(row);
  return baseline ? { percent: baseline.percent, euros: baseline.price - price } : null;
}

// At most `perChain` rows per chain, order kept. Pools arrive ranked by
// hotScore, and hotScore favours whichever chain has the most comparison
// coverage (measured 2026-11-11: a 40-row «Καθαριστικά» pool left room for only
// two chains, so the rail came out 8 My Market + 2 Μασούτης). Balancing the
// POOL first gives pickRail every chain's best rows to choose from.
export function balanceByChain<T extends { supermarket: string | null }>(rows: T[], perChain: number): T[] {
  const used = new Map<string, number>();
  return rows.filter((d) => {
    const chain = d.supermarket ?? '';
    const n = used.get(chain) ?? 0;
    if (n >= perChain) return false;
    used.set(chain, n + 1);
    return true;
  });
}

// Order for «Μεγάλες εκπτώσεις»: the printed percentage, nudged by department.
// Ranked on the percentage alone the rail was deodorant, floor wipes and a
// face towel — true, and useless for the weekly shop. Same judgement as
// hotness (−50 % on olive oil is news, on chewing gum it is not), same
// DEPT_PRIOR, here worth 2 percentage points per step.
export function savingRank(percent: number, category: string | null | undefined): number {
  return percent + 2 * (DEPT_PRIOR[category ?? ''] ?? 0);
}

const KNOWN = new Set<string>(DEPARTMENTS);

// Department rails: what this shopper looks at first (on-device interests,
// sent as a parameter — no profile is kept on the server), then the weekly
// shop's own order (hotness DEPT_PRIOR). «Άλλο» is not a department anyone
// browses.
export function orderDepartments(interests: string[] = []): { id: string; personal: boolean }[] {
  const mine = [...new Set(interests)].filter((c) => KNOWN.has(c) && c !== 'Άλλο');
  const rest = DEPARTMENTS.filter((c) => c !== 'Άλλο' && !mine.includes(c))
    .map((id, i) => ({ id, i }))
    .sort((a, b) => (DEPT_PRIOR[b.id] ?? 0) - (DEPT_PRIOR[a.id] ?? 0) || a.i - b.i)
    .map((x) => x.id);
  return [...mine.map((id) => ({ id, personal: true })), ...rest.map((id) => ({ id, personal: false }))];
}

// «Δημοφιλή τώρα» appears only when enough different shoppers clicked in the
// window for "popular" to mean something. Below that it is noise — often our
// own testing — and the rail is left out entirely.
export const POPULAR_MIN_SESSIONS = 30;
export const POPULAR_MIN_PER_DEAL = 3;
export function popularIsMeaningful(distinctSessions: number): boolean {
  return distinctSessions >= POPULAR_MIN_SESSIONS;
}
