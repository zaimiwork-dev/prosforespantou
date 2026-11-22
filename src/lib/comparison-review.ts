// The owner's review of the AI comparison verdicts (admin «Συγκρίσεις» tab).
//
// Only LIVE pairs are worth the owner's time: a verdict row whose two listings
// both still have an active, publicly visible offer. Each side carries the
// photo and price of that offer — a photo is the fastest way for a person to
// tell two products apart — and rows are ordered most visible first (the
// offers' hotScore), the same order the nightly check uses.
//
// Pure: the admin action loads the rows, this shapes them. Strip-safe.

import { listingKey, type Verdict } from './comparison-verdict.ts';

export type ReviewOffer = {
  id: string;
  productName: string;
  supermarket: string;
  discountedPrice: number;
  imageUrl: string | null;
  hotScore: number | null;
};

export type ReviewVerdictRow = {
  pairKey: string;
  chainA: string;
  nameA: string;
  chainB: string;
  nameB: string;
  verdict: string;
  model: string;
  reason: string | null;
  createdAt: Date | string;
};

export type ReviewFilter = {
  verdict?: Verdict | 'all';
  chain?: string;
  q?: string;
  offset?: number;
  limit?: number;
};

export type ReviewSide = {
  chain: string;
  name: string;
  offerId: string;
  price: number;
  imageUrl: string | null;
};

export type ReviewRow = {
  pairKey: string;
  verdict: Verdict;
  model: string;
  byOwner: boolean;
  why: string;
  onlyA: string;
  onlyB: string;
  a: ReviewSide;
  b: ReviewSide;
  priority: number;
};

export type ReviewCounts = Record<Verdict, number>;

export const REVIEW_PAGE_MAX = 100;

// "<why> [A: words | B: words] · was …" → the parts. Barcode and owner rows
// carry free text without the word lists.
export function parseReason(reason: string | null | undefined): { why: string; onlyA: string; onlyB: string } {
  const text = reason ?? '';
  const m = text.match(/^(.*?)\s*\[A:\s*(.*?)\s*\|\s*B:\s*(.*?)\]/);
  if (!m) return { why: text.trim(), onlyA: '', onlyB: '' };
  const clean = (s: string) => (s.trim() === '-' ? '' : s.trim());
  return { why: m[1].trim(), onlyA: clean(m[2]), onlyB: clean(m[3]) };
}

const fold = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ς/g, 'σ');

const isVerdict = (v: string): v is Verdict => v === 'same' || v === 'different' || v === 'unsure';

export function buildReviewRows(
  verdicts: ReviewVerdictRow[],
  offers: ReviewOffer[],
  filter: ReviewFilter = {},
): { total: number; counts: ReviewCounts; rows: ReviewRow[] } {
  // The most visible live offer behind each listing.
  const best = new Map<string, ReviewOffer>();
  for (const o of offers) {
    const k = listingKey(o.supermarket, o.productName);
    const prev = best.get(k);
    if (!prev || (o.hotScore ?? 0) > (prev.hotScore ?? 0)) best.set(k, o);
  }

  const counts: ReviewCounts = { same: 0, different: 0, unsure: 0 };
  const live: ReviewRow[] = [];
  for (const v of verdicts) {
    if (!isVerdict(v.verdict)) continue;
    const oa = best.get(listingKey(v.chainA, v.nameA));
    const ob = best.get(listingKey(v.chainB, v.nameB));
    if (!oa || !ob) continue;
    counts[v.verdict]++;
    const { why, onlyA, onlyB } = parseReason(v.reason);
    live.push({
      pairKey: v.pairKey,
      verdict: v.verdict,
      model: v.model,
      byOwner: v.model === 'owner',
      why,
      onlyA,
      onlyB,
      a: { chain: v.chainA, name: v.nameA, offerId: oa.id, price: oa.discountedPrice, imageUrl: oa.imageUrl },
      b: { chain: v.chainB, name: v.nameB, offerId: ob.id, price: ob.discountedPrice, imageUrl: ob.imageUrl },
      priority: Math.max(oa.hotScore ?? 0, ob.hotScore ?? 0),
    });
  }

  const want = filter.verdict ?? 'unsure';
  const q = fold(filter.q).trim();
  const matching = live
    .filter((r) => want === 'all' || r.verdict === want)
    .filter((r) => !filter.chain || r.a.chain === filter.chain || r.b.chain === filter.chain)
    .filter((r) => !q || fold(r.a.name).includes(q) || fold(r.b.name).includes(q))
    .sort((x, y) => y.priority - x.priority || (x.pairKey < y.pairKey ? -1 : 1));

  const offset = Math.max(0, filter.offset ?? 0);
  const limit = Math.min(Math.max(1, filter.limit ?? 50), REVIEW_PAGE_MAX);
  return { total: matching.length, counts, rows: matching.slice(offset, offset + limit) };
}
