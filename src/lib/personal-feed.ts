// Ranking for the «✨ Για σένα» rail (W4b, 2026-09-16).
//
// The rail used to ask the server for offers `where supermarket in
// (preferred)`. That is the opposite of what this product promises: if the
// same yogurt is 0.40€ cheaper at a chain the user did not tick, filtering
// HIDES the cheaper price. So preferred stores become a BOOST here — a
// familiar shop wins ties, a real saving elsewhere still gets through.
//
// Three other rules keep the rail from turning into an echo of itself:
//   • saving slots — SAVING_PER of every WINDOW slots are reserved for a row
//     that is the cheapest of its cluster at a chain the user did NOT tick.
//     This is the boost's whole point, and it has to be a reserved slot
//     rather than a bigger score: `isCheapestInCluster` depends on
//     cross-chain mapping coverage, which is wildly uneven (measured
//     2026-09-16: mymarket 813 flagged rows, masoutis 421, ab 22, lidl 0), so
//     scoring it above the store boost emptied an ΑΒ+Lidl user's rail of ΑΒ
//     and Lidl entirely — a data artifact masquerading as a saving;
//   • exploration — EXPLORE_PER of every WINDOW slots go to an offer from
//     outside the user's categories, so a profile built from four taps can
//     widen instead of narrowing forever;
//   • family cap — at most FAMILY_CAP rows per brand-ish family, because
//     five Misko pastas in a 14-card rail read as a broken feed;
//   • chain cap — hotScore is lumpy by chain (measured 09-16: with no stores
//     ticked, 13 of 14 cards were Μασούτης), so a chain the user did NOT tick
//     gets at most CHAIN_CAP cards. The user's own chains are never capped —
//     the rail is supposed to look like their shops.
//
// Pure functions; the caller owns fetching. Scores are deliberately small
// integers so they stay readable in a debugger.

import { scoreOffer, type InterestProfile } from './interest-profile';
import { capPerFamily } from './deal-family';

export const STORE_BOOST = 4; // ≈ a declared category is 10, a tap is 1
export const CHEAPEST_BOOST = 2; // tiebreak only — see the note above
export const WINDOW = 20;
export const SAVING_PER = 2; // cheapest-elsewhere rows per WINDOW slots
export const EXPLORE_PER = 2; // outside-my-categories rows per WINDOW slots
export const FAMILY_CAP = 2;
export const CHAIN_CAP = 3; // per chain the user did not tick

export interface FeedOffer {
  id?: string | number;
  supermarket?: string | null;
  category?: string | null;
  productName?: string | null;
  isCheapestInCluster?: boolean | null;
}

// Personal relevance + the signals that are about price, not taste.
export function personalScore(
  offer: FeedOffer,
  profile: InterestProfile,
  declaredCategories: string[],
  preferredStores: string[]
): number {
  let score = scoreOffer(offer, profile, declaredCategories);
  if (offer.supermarket && preferredStores.includes(offer.supermarket)) score += STORE_BOOST;
  if (offer.isCheapestInCluster) score += CHEAPEST_BOOST;
  return score;
}

// Slots (0-based) reserved in a rail of `limit` cards: `per` of every WINDOW,
// spread evenly and offset so the two kinds never land on the same card.
// Position 0 is never reserved — the first card must be the most relevant
// thing the user has.
export function reservedSlots(limit: number, per: number, offset = 0): number[] {
  if (limit <= 1 || per <= 0) return [];
  const every = Math.floor(WINDOW / per);
  const slots: number[] = [];
  for (let i = every - 1 - offset; i < limit; i += every) {
    if (i >= 1) slots.push(i);
  }
  return slots;
}

export const savingSlots = (limit: number) => reservedSlots(limit, SAVING_PER, 5);
export const exploreSlots = (limit: number) => reservedSlots(limit, EXPLORE_PER, 0);

export interface RankPersonalFeedInput<T extends FeedOffer> {
  deals: T[]; // pool matching the user's declared + learned categories
  explore?: T[]; // broader hot pool; rows outside `declaredCategories` are used
  profile: InterestProfile;
  declaredCategories: string[];
  learnedCategories?: string[]; // counts as "already interested" for exploration
  preferredStores?: string[];
  limit?: number;
  familyCap?: number;
}

// Stable sort: equal scores keep the order they arrived in, which is the
// server's hotScore ranking — so hotness is the tiebreaker for free.
export function rankPersonalFeed<T extends FeedOffer>({
  deals,
  explore = [],
  profile,
  declaredCategories,
  learnedCategories = [],
  preferredStores = [],
  limit = 14,
  familyCap = FAMILY_CAP,
}: RankPersonalFeedInput<T>): T[] {
  if (!Array.isArray(deals) || deals.length === 0) return [];

  const scored = deals
    .map((d, i) => ({ d, i, s: personalScore(d, profile, declaredCategories, preferredStores) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.d);

  // The cheaper-elsewhere rows come out of the same pool BEFORE the family
  // cap runs, so a brand that fills the main list can still supply a saving.
  const savers = preferredStores.length
    ? capPerFamily(
        scored.filter((d) => d.isCheapestInCluster && d.supermarket && !preferredStores.includes(d.supermarket)),
        1
      )
    : [];
  const saverIds = new Set<unknown>(savers.map((d) => d.id));
  const perChain = new Map<string, number>();
  const ranked = capPerFamily(
    scored.filter((d) => {
      if (saverIds.has(d.id)) return false;
      const chain = d.supermarket;
      if (!chain || preferredStores.includes(chain)) return true;
      const n = perChain.get(chain) || 0;
      if (n >= CHAIN_CAP) return false;
      perChain.set(chain, n + 1);
      return true;
    }),
    familyCap
  );

  const known = new Set([...declaredCategories, ...learnedCategories]);
  const poolIds = new Set<unknown>(deals.map((d) => d.id).filter((id) => id != null));
  const explorers = capPerFamily(
    explore.filter((d) => !poolIds.has(d.id) && d.category && !known.has(d.category)),
    1
  );

  const saving = new Set(savers.length ? savingSlots(limit) : []);
  const exploring = new Set(explorers.length ? exploreSlots(limit) : []);
  const out: T[] = [];
  let ri = 0;
  let si = 0;
  let ei = 0;
  for (let pos = 0; pos < limit; pos++) {
    if (saving.has(pos) && si < savers.length) { out.push(savers[si++]); continue; }
    if (exploring.has(pos) && ei < explorers.length) { out.push(explorers[ei++]); continue; }
    if (ri < ranked.length) { out.push(ranked[ri++]); continue; }
    if (si < savers.length) { out.push(savers[si++]); continue; }
    if (ei < explorers.length) { out.push(explorers[ei++]); continue; }
    break;
  }
  return out;
}
