// Honest "is this actually cheap?" verdict. Compares the price a shopper is
// ACTUALLY looking at (the offer's discountedPrice) against the recorded
// price-history distribution for that product. Pure + strip-safe so the .mjs
// precompute script can import it (same constraint as lib/hotness.ts and
// lib/categories.ts — no enums/namespaces/decorators).
//
// The cardinal rule: the verdict judges `current` (the displayed offer price),
// NOT the last snapshot in the series. The series can be cross-chain, so its
// last point may be a different store's price — judging against that produced
// false "lowest price" badges on offers that were actually the most expensive
// they'd ever been.

export type Verdict = 'lowest' | 'good' | 'fair' | 'meh' | 'high';

export interface VerdictResult {
  verdict: Verdict | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  // Percent the current price sits above the window minimum (0 = at the low).
  percentAboveMin: number | null;
}

const EMPTY: VerdictResult = { verdict: null, min: null, max: null, avg: null, percentAboveMin: null };

// Positive verdicts are the only ones we surface as a badge — product decision:
// highlight good deals, stay silent on mediocre ones (never warn, never lie).
const POSITIVE = new Set<Verdict>(['lowest', 'good']);

export function isPositiveVerdict(v: Verdict | null | undefined): boolean {
  return !!v && POSITIVE.has(v);
}

// A verdict needs enough history to mean anything. With 1–2 points, "lowest
// price we've seen" is trivially true and dishonest (we've barely seen it).
// Matches the sparkline's own >=3 render threshold.
const MIN_POINTS = 3;

/**
 * @param current the offer price the shopper sees (Discount.discountedPrice)
 * @param prices  recorded prices over the window (PriceSnapshot.price[])
 * @param opts.minPoints minimum data points before a verdict is offered (default 3)
 */
export function computeVerdict(
  current: number | null | undefined,
  prices: number[],
  opts: { minPoints?: number } = {}
): VerdictResult {
  if (current == null || !Number.isFinite(current) || !prices || prices.length === 0) {
    return EMPTY;
  }
  const clean = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (clean.length === 0) return EMPTY;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const avg = clean.reduce((s, p) => s + p, 0) / clean.length;
  const epsilon = 0.01;

  const overMin = current - min;
  const overMinPct = min > 0 ? (overMin / min) * 100 : 0;

  const stats = {
    min: round2(min),
    max: round2(max),
    avg: round2(avg),
    percentAboveMin: Math.round(overMinPct * 10) / 10,
  };

  // Not enough history, or the price never moved → no honest verdict to give.
  // A flat history means "this is just the price", not a deal.
  const minPoints = opts.minPoints ?? MIN_POINTS;
  if (clean.length < minPoints || max - min <= epsilon) {
    return { verdict: null, ...stats };
  }

  let verdict: Verdict;
  if (overMin <= epsilon) verdict = 'lowest';         // at/below the lowest we've recorded
  else if (overMinPct <= 5) verdict = 'good';         // within 5% of the low
  else if (current < avg) verdict = 'fair';           // cheaper than typical, but not a low
  else if (current <= avg + epsilon) verdict = 'meh'; // about average
  else verdict = 'high';                              // above average

  return { verdict, ...stats };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
