// «Ιστορικό τιμής» — everything the website AND the app decide before they draw
// (owner 2026-11-22: «make the price history refined, readable and actually
// usable»). One copy: the app imports it as @shared/price-history-view (see
// mobile/metro.config.js), so the two can never word or scale it differently.
//
//   - which of four cases to show (nothing / one reading / not trustworthy / chart)
//   - the lead sentence in plain Greek: «Συνήθως 2,57 €. Σε προσφορά 6 φορές
//     από τον Σεπτέμβριο, με χαμηλότερη τιμή 1,53 €.»
//   - time and price scales, what falls inside a range, what a finger touches
//   - the dotted «συνήθως» line and the shaded offer periods
//
// Moved here from mobile/src/components/offer/price-timeline-model.ts, which
// now re-exports it. No percentage is computed here: the one shown
// (`shelfChangePct`) comes from the server and is only rounded for printing.
// PURE: relative type imports only — no Next.js, no React Native, no globals.
import type { PriceTimeline } from './price-timeline.ts';

export type RangeKey = '1M' | '3M' | '6M' | 'ALL';
export const RANGES: { key: RangeKey; label: string; days: number | null; a11y: string }[] = [
  { key: '1M', label: '1Μ', days: 30, a11y: 'Τελευταίος μήνας' },
  { key: '3M', label: '3Μ', days: 91, a11y: 'Τελευταίοι τρεις μήνες' },
  { key: '6M', label: '6Μ', days: 182, a11y: 'Τελευταίοι έξι μήνες' },
  { key: 'ALL', label: 'Όλα', days: null, a11y: 'Όλο το ιστορικό' },
];

const DAY = 86400000;
const EPS = 0.005;
const MONTHS_ACC = ['Ιανουάριο', 'Φεβρουάριο', 'Μάρτιο', 'Απρίλιο', 'Μάιο', 'Ιούνιο', 'Ιούλιο', 'Αύγουστο', 'Σεπτέμβριο', 'Οκτώβριο', 'Νοέμβριο', 'Δεκέμβριο'];
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

// A chart needs at least this much history to say anything: an AB bread
// whose per-SKU rows began that morning drew ten hours as a «history»
// (2026-11-22). Shorter = the «tracking since» line.
export const MIN_CHART_DAYS = 7;
// «Η χαμηλότερη τιμή από …» is a claim about a stretch of time; on a few
// days of data it is true and misleading («lowest since November» on 22 Nov).
export const MIN_LOWEST_CLAIM_DAYS = 28;

export type ViewKind = 'none' | 'thin' | 'unreliable' | 'chart';
export function viewKind(t: PriceTimeline | undefined | null, now: number = Date.now()): ViewKind {
  if (!t || t.quality === 'none') return 'none';
  if (t.quality === 'thin') return 'thin';
  if (t.reliable === false) return 'unreliable';
  if (t.since && now - ms(t.since) < MIN_CHART_DAYS * DAY) return 'thin';
  return 'chart';
}

const ms = (iso: string) => new Date(iso).getTime();

/** «12 Νοε», plus the year when it is not the current one. */
export function formatDay(iso: string | number, now: number = Date.now()): string {
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Accusative month for «από …»: «Οκτώβριο», «Οκτώβριο 2025» across a year. */
export function formatMonthFrom(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const m = MONTHS_ACC[d.getMonth()];
  return d.getFullYear() === new Date(now).getFullYear() ? m : `${m} ${d.getFullYear()}`;
}

// ---- Scales ---------------------------------------------------------------

export type Domain = { t0: number; t1: number };
export function domainFor(t: PriceTimeline, range: RangeKey, now: number): Domain {
  const since = t.since ? ms(t.since) : now - 30 * DAY;
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const t0 = days == null ? since : Math.max(since, now - days * DAY);
  // At least a day wide so a brand-new history does not divide by zero.
  return { t0: Math.min(t0, now - DAY), t1: now };
}

export type Step = { from: number; to: number; price: number };
export type PromoMark = { at: number; until: number | null; price: number };

/**
 * The stepped shelf line as an SVG path. A step shorter than `minPx` (a price
 * read for seconds) is widened to `minPx` so it stays visible.
 */
export function shelfPath(steps: Step[], x: (t: number) => number, y: (p: number) => number, minPx = 4): string {
  let d = '';
  steps.forEach((s, i) => {
    const x0 = x(s.from);
    const x1 = Math.max(x(s.to), x0 + minPx);
    const yy = y(s.price).toFixed(1);
    d += i === 0 ? `M ${x0.toFixed(1)} ${yy} L ${x1.toFixed(1)} ${yy}` : ` L ${x0.toFixed(1)} ${yy} L ${x1.toFixed(1)} ${yy}`;
  });
  return d;
}

/** Shelf steps clipped to the domain; steps wholly outside are dropped. */
export function visibleShelf(t: PriceTimeline, d: Domain): Step[] {
  return t.shelf
    .map((s) => ({ from: ms(s.from), to: ms(s.to), price: s.price }))
    .filter((s) => s.to >= d.t0 && s.from <= d.t1)
    .map((s) => ({ ...s, from: Math.max(s.from, d.t0), to: Math.min(s.to, d.t1) }));
}

/**
 * Promos in the domain. A segment exists only when the data closes it
 * (`until`) or says it is still running (`ongoing`, drawn up to now); a promo
 * is never stretched to the next point.
 */
export function visiblePromos(t: PriceTimeline, d: Domain): PromoMark[] {
  return t.promos
    .map((p) => ({
      at: ms(p.at),
      until: p.until ? ms(p.until) : p.ongoing ? d.t1 : null,
      price: p.price,
    }))
    .filter((p) => p.at >= d.t0 && p.at <= d.t1);
}

export type Band = { from: number; to: number };
/**
 * The offer periods to shade: only the ones whose span the data knows (closed,
 * or still running). An offer with an unknown end stays a dot — shading it to
 * the next reading would invent days it may not have run.
 */
export function offerBands(promos: PromoMark[]): Band[] {
  return promos
    .filter((p): p is PromoMark & { until: number } => p.until != null && p.until > p.at)
    .map((p) => ({ from: p.at, to: p.until }));
}

/**
 * The usual price (same number as «Κανονική τιμή» and the card's «κανονικά»),
 * drawn as a dotted reference line — unless the shelf line already says it
 * (a single flat step at that price).
 */
export function usualLineFor(t: PriceTimeline): number | null {
  const u = t.stats.shelfUsual ?? null;
  if (u == null) return null;
  if (t.shelf.length <= 1 && t.stats.shelfNow != null && Math.abs(t.stats.shelfNow - u) < EPS) return null;
  return u;
}

export type YScale = { lo: number; hi: number; ticks: number[] };
/** Price axis over everything visible (+ the price on screen), with 2-3 gridlines. */
export function yScaleFor(prices: number[]): YScale {
  const vals = prices.filter((p) => Number.isFinite(p));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (!(max - min >= 0.01)) {
    // Flat history: one gridline, room above and below.
    const pad = Math.max(min * 0.1, 0.1);
    return { lo: min - pad, hi: max + pad, ticks: [round2(min)] };
  }
  const pad = (max - min) * 0.12;
  const mid = round2((min + max) / 2);
  const ticks = [round2(min), mid, round2(max)];
  // Drop a middle line that would sit on top of a neighbour as printed.
  const uniq = ticks.filter((v, i) => i === 0 || Math.abs(v - ticks[i - 1]) >= 0.01);
  return { lo: min - pad, hi: max + pad, ticks: uniq };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export const xOf = (time: number, d: Domain, left: number, width: number) =>
  left + ((time - d.t0) / (d.t1 - d.t0)) * width;
export const yOf = (price: number, s: YScale, top: number, height: number) =>
  top + (1 - (price - s.lo) / (s.hi - s.lo)) * height;

// ---- Touch ----------------------------------------------------------------

export type Picked = { at: number; price: number; kind: 'shelf' | 'promo' };
/**
 * What the finger at time `at` is on. A promo dot wins when it is within
 * `promoSlopMs` (a finger width in time); otherwise the shelf price in force at
 * that moment; with no shelf covering it, the nearest promo.
 */
export function pickAt(at: number, shelf: Step[], promos: PromoMark[], promoSlopMs: number): Picked | null {
  let bestPromo: PromoMark | null = null;
  for (const p of promos) {
    if (!bestPromo || Math.abs(p.at - at) < Math.abs(bestPromo.at - at)) bestPromo = p;
  }
  if (bestPromo && Math.abs(bestPromo.at - at) <= promoSlopMs) {
    return { at: bestPromo.at, price: bestPromo.price, kind: 'promo' };
  }
  const step = shelf.find((s) => at >= s.from && at <= s.to);
  if (step) return { at, price: step.price, kind: 'shelf' };
  if (bestPromo) return { at: bestPromo.at, price: bestPromo.price, kind: 'promo' };
  return null;
}

// ---- Words ----------------------------------------------------------------

type PriceFmt = (n: number) => string;

export type Headline = {
  // Green pill, only when the price on screen is the lowest we have seen.
  pill: string | null;
  // One or two short sentences: what it usually costs, then how often it is
  // on offer (or how the regular price moved). Each part only when true.
  sentence: string | null;
};

/**
 * The lead of the price history, in the words a shopper would use (owner
 * 2026-11-22). Read top to bottom it answers: is today's price good, what does
 * it normally cost, does it often go on offer.
 */
export function headlineFor(t: PriceTimeline, fmt: PriceFmt, now: number = Date.now()): Headline {
  const s = t.stats;
  const longEnough = t.since != null && now - ms(t.since) >= MIN_LOWEST_CLAIM_DAYS * DAY;
  const pill = s.currentIsLowest && t.since && longEnough ? `Η χαμηλότερη τιμή από τον ${formatMonthFrom(t.since, now)}` : null;

  const parts: string[] = [];
  const usual = s.shelfUsual ?? s.shelfNow;
  if (usual != null) parts.push(`Συνήθως ${fmt(usual)}.`);

  // Each claim dates from ITS OWN first observation (lead review 2026-11-13:
  // an offer seen in April must not date a shelf move first read in November).
  const promoSince = t.promos[0]?.at;
  const shelfSince = t.shelf[0]?.from;
  if (s.promoCount >= 2 && promoSince) {
    const low = s.lowest && !pill ? `, με χαμηλότερη τιμή ${fmt(s.lowest.price)}` : '';
    parts.push(`Σε προσφορά ${s.promoCount} φορές από τον ${formatMonthFrom(promoSince, now)}${low}.`);
  } else if (s.shelfChangePct != null && Math.abs(s.shelfChangePct) >= 1 && shelfSince) {
    const up = s.shelfChangePct > 0;
    parts.push(`Η κανονική τιμή ${up ? 'ανέβηκε' : 'έπεσε'} ${Math.round(Math.abs(s.shelfChangePct))}% από τον ${formatMonthFrom(shelfSince, now)}.`);
  } else if (t.shelf.length > 0 && s.shelfChanges === 0 && shelfSince && now - ms(shelfSince) >= 14 * DAY) {
    parts.push(`Η κανονική τιμή δεν έχει αλλάξει από τον ${formatMonthFrom(shelfSince, now)}.`);
  } else if (s.lowest && !s.currentIsLowest && (usual == null || s.lowest.price < usual - EPS)) {
    parts.push(`Χαμηλότερη που έχουμε δει: ${fmt(s.lowest.price)} (${formatDay(s.lowest.at, now)}).`);
  }

  return { pill, sentence: parts.length ? parts.join(' ') : null };
}

export type Fact = { id: 'lowestNow' | 'change' | 'lowest' | 'shelfNow' | 'promos'; text: string; good?: boolean };

/**
 * At most three facts, each only when true. Priority (not spec order): the
 * green «lowest» pill, the shelf move, the lowest seen (skipped when the pill
 * already says it), the regular price, the promo count. (The app before the
 * lead sentence; kept for older screens and the tests that pin the rules.)
 */
export function factsFor(t: PriceTimeline, fmt: PriceFmt, now: number = Date.now()): Fact[] {
  const out: Fact[] = [];
  const s = t.stats;
  const since = t.since;
  if (s.currentIsLowest && since) {
    out.push({ id: 'lowestNow', good: true, text: `Η χαμηλότερη τιμή από ${formatMonthFrom(since, now)}` });
  }
  const shelfSince = t.shelf[0]?.from;
  if (s.shelfChangePct != null && Math.abs(s.shelfChangePct) >= 1 && shelfSince) {
    const up = s.shelfChangePct > 0;
    out.push({
      id: 'change',
      text: `Η κανονική τιμή ${up ? 'ανέβηκε' : 'έπεσε'} ${Math.round(Math.abs(s.shelfChangePct))}% από ${formatMonthFrom(shelfSince, now)}`,
    });
  }
  if (s.lowest && !s.currentIsLowest) {
    out.push({ id: 'lowest', text: `Χαμηλότερη που έχουμε δει: ${fmt(s.lowest.price)} (${formatDay(s.lowest.at, now)})` });
  }
  const normal = s.shelfUsual ?? s.shelfNow;
  if (normal != null) out.push({ id: 'shelfNow', text: `Κανονική τιμή: ${fmt(normal)}` });
  const promoSince = t.promos[0]?.at;
  if (s.promoCount >= 2 && promoSince) {
    out.push({ id: 'promos', text: `Σε προσφορά ${s.promoCount} φορές από ${formatMonthFrom(promoSince, now)}` });
  }
  return out.slice(0, 3);
}

export const thinLine = (t: PriceTimeline, now: number = Date.now()) =>
  t.since ? `Παρακολουθούμε αυτή την τιμή από τις ${formatDay(t.since, now)}.` : 'Μόλις άρχισε η παρακολούθηση αυτής της τιμής.';
export const UNRELIABLE_LINE = 'Δεν έχουμε ακόμα αξιόπιστο ιστορικό τιμής για αυτό το προϊόν.';
export const footnote = (t: PriceTimeline, now: number = Date.now()) =>
  t.since ? `Παρακολουθούμε την τιμή από τις ${formatDay(t.since, now)}.` : null;

/** One sentence for the screen reader: the words, not the picture. */
export function chartLabel(t: PriceTimeline, fmt: PriceFmt, now: number = Date.now()): string {
  const h = headlineFor(t, fmt, now);
  return ['Ιστορικό τιμής.', h.pill ? `${h.pill}.` : '', h.sentence ?? '', footnote(t, now) ?? ''].filter(Boolean).join(' ');
}
