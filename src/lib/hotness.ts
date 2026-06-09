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
};

// Per-click immediate bump applied in track-event.ts (cheap, no recompute).
// The daily recompute folds clicks in authoritatively with a recency window.
export const CLICK_WEIGHT = 8;
// Cap so one viral deal can't pin the top of the page forever.
const MAX_CLICKS_COUNTED = 25;

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

export function computeHotScore(input: HotInput): number {
  const name = normalize(input.productName);
  const text = `${name} ${normalize(input.description)}`;
  const pct = input.discountPercent ?? 0;
  const clicks = Math.min(Math.max(input.clicks ?? 0, 0), MAX_CLICKS_COUNTED);

  const score =
    kviBoost(name) +
    brandBoost(name) +
    mechanicBoost(text) +
    pct * 0.2 +
    clicks * CLICK_WEIGHT +
    recencyBoost(input.createdAt);

  // Round to 2dp so the persisted value is stable/comparable.
  return Math.round(score * 100) / 100;
}
