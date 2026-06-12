// On-device interest profile — the v1 "algorithm".
//
// Big-platform recommenders are collaborative filtering over millions of
// logged-in users; with anonymous visitors and early traffic the honest,
// effective equivalent is content-based: what the user DECLARED (onboarding
// categories, lib/store preferredCategories) plus what they DO (taps, list
// adds, favorites), decayed over time, blended with the global hotScore.
// Everything lives in localStorage — no accounts, no server profile, nothing
// to leak. The same ClickEvents we already log server-side are the dataset a
// real collaborative model can graduate to later (PHASES Phase 10).
//
// Pure functions below; localStorage wrappers at the bottom.

export interface InterestProfile {
  updatedAt: number; // ms epoch of last decay application
  categories: Record<string, number>;
  brands: Record<string, number>;
}

export const EMPTY_PROFILE: InterestProfile = { updatedAt: 0, categories: {}, brands: {} };

// Signal strengths: an add-to-list is a much stronger statement than a tap;
// a favorite is "I buy this regularly".
export const WEIGHT = { view: 1, listAdd: 3, favorite: 4 } as const;

const HALF_LIFE_DAYS = 14;
const PRUNE_BELOW = 0.05;
const MAX_KEYS = 60; // per map — a personal profile, not a data warehouse

// First word of the offer name ≈ brand for ranking purposes. Cheap and wrong
// sometimes ("Στιγμιαίος Καφές…"), but wrong consistently — it still clusters
// repeat behavior on the same products.
export function brandToken(name: string | null | undefined): string | null {
  if (!name) return null;
  const t = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-zα-ω0-9]/g, '');
  return t && t.length >= 3 ? t : null;
}

function decayMap(map: Record<string, number>, factor: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    const nv = v * factor;
    if (nv >= PRUNE_BELOW) out[k] = nv;
  }
  return out;
}

function capMap(map: Record<string, number>): Record<string, number> {
  const entries = Object.entries(map);
  if (entries.length <= MAX_KEYS) return map;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_KEYS));
}

// Apply time decay since the profile was last touched (half-life 14 days):
// last month's yogurt phase fades; this week's diaper hunt dominates.
export function decayProfile(profile: InterestProfile, nowMs: number): InterestProfile {
  if (!profile.updatedAt) return { ...profile, updatedAt: nowMs };
  const days = Math.max(0, (nowMs - profile.updatedAt) / 86400000);
  if (days < 0.01) return profile;
  const factor = Math.pow(0.5, days / HALF_LIFE_DAYS);
  return {
    updatedAt: nowMs,
    categories: decayMap(profile.categories, factor),
    brands: decayMap(profile.brands, factor),
  };
}

export function bumpProfile(
  profile: InterestProfile,
  offer: { category?: string | null; productName?: string | null },
  weight: number,
  nowMs: number
): InterestProfile {
  const p = decayProfile(profile, nowMs);
  const categories = { ...p.categories };
  const brands = { ...p.brands };
  if (offer.category && offer.category !== 'Άλλο') {
    categories[offer.category] = (categories[offer.category] ?? 0) + weight;
  }
  const brand = brandToken(offer.productName);
  if (brand) brands[brand] = (brands[brand] ?? 0) + weight;
  return { updatedAt: p.updatedAt, categories: capMap(categories), brands: capMap(brands) };
}

// Personal relevance of one offer. Declared categories are the strongest
// signal (the user TOLD us); learned categories and brands stack on top.
// Caller blends this with hotScore order (stable sort = hot rank breaks ties).
export function scoreOffer(
  offer: { category?: string | null; productName?: string | null },
  profile: InterestProfile,
  declaredCategories: string[]
): number {
  let score = 0;
  if (offer.category) {
    if (declaredCategories.includes(offer.category)) score += 10;
    score += profile.categories[offer.category] ?? 0;
  }
  const brand = brandToken(offer.productName);
  if (brand) score += (profile.brands[brand] ?? 0) * 1.5;
  return score;
}

// Top learned categories, strongest first.
export function topCategories(profile: InterestProfile, n: number): string[] {
  return Object.entries(profile.categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

// ── localStorage wrappers (client only) ──────────────────────────────────────

const LS_KEY = 'pp-interests-v1';

export function loadProfile(): InterestProfile {
  if (typeof window === 'undefined') return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY_PROFILE;
    const p = JSON.parse(raw);
    return {
      updatedAt: Number(p.updatedAt) || 0,
      categories: p.categories ?? {},
      brands: p.brands ?? {},
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function recordInterest(
  offer: { category?: string | null; productName?: string | null },
  weight: number
): void {
  if (typeof window === 'undefined') return;
  try {
    const next = bumpProfile(loadProfile(), offer, weight, Date.now());
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch { /* storage full/blocked — personalization is best-effort */ }
}
