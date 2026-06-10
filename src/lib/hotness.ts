// Hotness scoring — mimics how a Greek supermarket φυλλάδιο is merchandised.
//
// A leaflet's front page is NOT sorted by discount % or by best-sellers. Beyond
// paid supplier placement (which we deliberately do NOT copy), it front-loads:
//   1. KVIs / footfall drivers — γάλα, καφές, απορρυπαντικό, λάδι, αναψυκτικά …
//      (curated from category knowledge, not telemetry).
//   2. Recognizable FMCG brands (the names that headline every leaflet).
//   3. Strong deal mechanics — "1+1", "ΔΩΡΟ", "SUPER ΤΙΜΗ", big %.
//   4. As real traffic arrives: actually-clicked deals (the "δημοφιλή" signal).
//
// computeHotScore() folds those into one number. It is a PURE function so both
// the .ts server actions and the .mjs ingestion scripts can import it (Node's
// type-stripping loads this file directly from the scripts — keep it free of
// enums/namespaces/decorators so it stays strip-safe).
//
// The lists below are intentionally editable — they encode "what Greek shoppers
// care about". Tune freely; the score recomputes on the next daily cron.

export type HotInput = {
  productName?: string | null;
  description?: string | null;
  discountPercent?: number | null;
  createdAt?: Date | string | null;
  // Click signal. At write time this is 0; the daily recompute passes a
  // recent-window count; track-event bumps the stored score directly.
  clicks?: number | null;
  // Recent list_add count — a stronger intent signal than a click (the user
  // committed the offer to their shopping list). Recompute-only.
  listAdds?: number | null;
  // Honest-pricing verdict (Discount.priceVerdict). Genuinely good prices rise,
  // offers priced ABOVE their own history sink — "hot" must never contradict
  // the honesty badge shown on the same card.
  priceVerdict?: string | null;
  // Stable tie-breaking jitter key (the discount id, recompute-only). Without
  // it hundreds of no-click rows share one score and the list collapses into
  // same-chain blocks ordered by expiry.
  jitterKey?: string | null;
};

// Per-click immediate bump applied in track-event.ts (cheap, no recompute).
// Deliberately smaller than what one click is "worth" in the recompute — at
// today's traffic a couple of stray clicks (often our own testing) must not
// pin an item to the top; the nightly log-dampened recompute is authoritative.
export const CLICK_WEIGHT = 3;

// Lowercase + strip Greek/Latin accents so "ΕΛΑΙΟΛΑΔΟ" and "ελαιόλαδο" match.
function normalize(s: string | null | undefined): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// KVI staples — keyword (accent-stripped) → weight. Matched against the product
// name. Keyword matching (not exact category) on purpose: the category field is
// 348 fragmented values, ~34% "Άλλο", so it's unreliable; the name is not.
const KVI_TIERS: { weight: number; terms: string[] }[] = [
  // Tier 1 — classic front-page footfall drivers.
  { weight: 10, terms: [
    'γαλα', 'καφε', 'nescafe', 'espresso', 'ελαιολαδο', 'απορρυπαντικ',
    'πλυντηριου', 'χαρτι υγειας', 'χαρτι κουζινας', 'βρεφικ', 'πανες',
    'pampers', 'αναψυκτ', 'coca', 'πορτοκαλαδα', 'μπυρα', 'beer', 'νερο',
  ] },
  // Tier 2 — everyday staples.
  { weight: 6, terms: [
    'ζυμαρικ', 'μακαρον', 'ρυζι', 'ζαχαρη', 'αλευρι', 'τυρι', 'φετα',
    'γραβιερα', 'γκουντα', 'γιαουρτ', 'βουτυρο', 'μαργαριν', 'αυγα', 'κιμα',
    'κοτοπουλο', 'χοιριν', 'κρεας', 'ψαρι', 'φρουτ', 'λαχανικ', 'χυμο',
    'δημητριακ',
  ] },
  // Tier 3 — high-frequency personal/household.
  { weight: 3, terms: [
    'σαμπουαν', 'αφρολουτρο', 'οδοντοκρεμα', 'σαπουν', 'χαρτομαντηλ',
    'σερβιετ', 'αποσμητικ',
  ] },
];

// Headline FMCG brands — the names that lead a leaflet. Binary boost (+4 if any
// present), not per-term, so a multi-brand string isn't double-counted.
const BRAND_WEIGHT = 4;
const BRAND_TERMS: string[] = [
  'coca', 'cola', 'pepsi', 'amita', 'lacta', 'ιον ', 'παυλιδ', 'nestle',
  'nescafe', 'jacobs', 'λουμιδ', 'bravo', 'φαγε', 'δελτα', 'μεβγαλ', 'ολυμπος',
  'νουνου', 'βλαχα', 'παπαδοπουλ', 'misko', 'μελισσα', 'barilla', 'knorr',
  'hellmann', 'pummaro', 'κυκνος', 'ariel', 'skip', 'dixan', 'tide', 'lenor',
  'fairy', 'ajax', 'klinex', 'vanish', 'pampers', 'babylino', 'always',
  'colgate', 'gillette', 'nivea', 'dove', 'palmolive', 'pantene', 'αλτις',
  'μινερβα', 'amstel', 'μυθος', 'heineken',
];

// Deal-mechanic hooks — the leaflet magnet. Scored off name + description.
function mechanicBoost(text: string): number {
  let b = 0;
  if (/1\s*\+\s*1|2\s*\+\s*1|3 για 2/.test(text)) b += 8; // multibuy
  if (text.includes('δωρο')) b += 6;                       // ΔΩΡΟ / gift
  if (text.includes('super')) b += 5;                      // SUPER ΤΙΜΗ
  if (text.includes('προσφορα')) b += 2;
  return b;
}

function kviBoost(name: string): number {
  for (const tier of KVI_TIERS) {
    if (tier.terms.some((t) => name.includes(t))) return tier.weight;
  }
  return 0;
}

function brandBoost(name: string): number {
  return BRAND_TERMS.some((t) => name.includes(t)) ? BRAND_WEIGHT : 0;
}

// Small freshness nudge: full +2 on day 0, fading to 0 over ~10 days.
function recencyBoost(createdAt: Date | string | null | undefined): number {
  if (!createdAt) return 0;
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.max(0, 2 - Math.max(0, days) * 0.2);
}

// Log-dampened popularity: the FIRST few interactions matter most, then each
// extra one matters less. At low traffic this stops 3-4 stray clicks (often
// our own browsing) from catapulting a random item over the curated signals;
// at high traffic it stops one viral deal pinning the top forever.
function popularityBoost(clicks: number, listAdds: number): number {
  const c = Math.max(clicks, 0);
  const a = Math.max(listAdds, 0);
  return Math.log2(1 + c) * 7 + Math.log2(1 + a) * 10;
}

// Honest deal quality: surface what's genuinely cheap, demote offers priced
// above their own 90-day history. Mirrors lib/price-verdict.ts levels.
const VERDICT_BOOST: Record<string, number> = {
  lowest: 8,
  good: 4,
  fair: 0,
  meh: -2,
  high: -6,
};

// Deterministic per-row jitter in [0, 1.2) — breaks the huge score plateaus
// (hundreds of rows tie without it) into a stable shuffle that mixes chains.
// Same key always yields the same value, so pagination/ordering is stable.
function stableJitter(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 120) / 100;
}

export function computeHotScore(input: HotInput): number {
  const name = normalize(input.productName);
  const text = `${name} ${normalize(input.description)}`;
  const pct = input.discountPercent ?? 0;

  const score =
    kviBoost(name) +
    brandBoost(name) +
    mechanicBoost(text) +
    pct * 0.2 +
    popularityBoost(input.clicks ?? 0, input.listAdds ?? 0) +
    (VERDICT_BOOST[input.priceVerdict ?? ''] ?? 0) +
    recencyBoost(input.createdAt) +
    (input.jitterKey ? stableJitter(input.jitterKey) : 0);

  // Round to 2dp so the persisted value is stable/comparable.
  return Math.round(score * 100) / 100;
}
