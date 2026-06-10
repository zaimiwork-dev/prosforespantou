// Search relevance — shared by the server search action AND the client
// suggestion dropdown so the two can't drift (they previously each had their
// own copy of the greeklish expansion and both matched bare substrings).
//
// Why this exists: substring LIKE + ORDER BY expiry meant searching "γάλα"
// (milk) returned body lotions ("ΓΑΛΑκτωμα") and honey-milk soaps before any
// actual milk. Ranking principles, in order of weight:
//   1. WHERE the term matches: whole word in the name > word-prefix in the
//      name > substring in the name > description/category only.
//   2. WHAT the user means: the query runs through the same categorizer the
//      catalog uses — "γάλα" maps to Γαλακτοκομικά, so dairy rows outrank a
//      soap whose scent name also contains the word.
//   3. Popularity (hotScore) breaks ties, never decides relevance.
//
// Pure + strip-safe (no enums/decorators) — imported by .mjs-style client
// components and server actions alike.

import { categorize } from './categories';

const GREEKLISH_MAP: Record<string, string> = {
  th: 'θ', ch: 'χ', ps: 'ψ', ou: 'ου', mp: 'μπ',
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε',
  z: 'ζ', h: 'η', i: 'ι', k: 'κ', l: 'λ',
  m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π',
  r: 'ρ', s: 'σ', t: 'τ', u: 'υ', y: 'υ',
  f: 'φ', v: 'β', w: 'ω', q: 'κ',
};

const SYNONYMS = [
  ['gouda', 'γουδα', 'γκουντα'],
  ['bacon', 'μπεικον', 'μπεηκον'],
  ['edam', 'ενταμ'],
  ['cheddar', 'τσενταρ'],
  ['kelloggs', 'κελογκς'],
  ['quaker', 'κουακερ'],
  ['pampers', 'παμπερς'],
];

export function normalizeSearchText(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function greeklishToGreek(text: string): string {
  const lower = text.toLowerCase();
  let result = '';
  let i = 0;
  while (i < lower.length) {
    const two = lower[i] + (lower[i + 1] ?? '');
    if (GREEKLISH_MAP[two]) { result += GREEKLISH_MAP[two]; i += 2; }
    else if (GREEKLISH_MAP[lower[i]]) { result += GREEKLISH_MAP[lower[i]]; i++; }
    else { result += lower[i]; i++; }
  }
  return result;
}

// Query → all the spellings it might appear as (greeklish both ways, common
// ambiguity fixes, brand synonyms). Identical behavior to the two previous
// inline copies; now there is exactly one.
export function expandSearch(query: string): string[] {
  const raw = normalizeSearchText(query.trim());
  if (!raw) return [];
  const terms = new Set<string>([raw]);

  const isLatin = /^[a-zA-Z\s]+$/.test(raw);
  if (isLatin) {
    const greek = normalizeSearchText(greeklishToGreek(raw));
    terms.add(greek);
    if (raw.includes('x')) terms.add(greek.replace(/ξ/g, 'χ'));
    if (raw.includes('h')) {
      terms.add(greek.replace(/η/g, 'χ'));
      terms.add(greek.replace(/η/g, 'ι'));
    }
    if (raw.includes('u')) terms.add(greek.replace(/ου/g, 'υ'));
    if (raw.includes('y')) terms.add(greek.replace(/υ/g, 'ι'));
    if (raw.includes('w')) terms.add(greek.replace(/ω/g, 'ο'));
    if (raw.includes('b')) terms.add(greek.replace(/β/g, 'μπ'));
    if (raw.includes('d')) terms.add(greek.replace(/δ/g, 'ντ'));
    if (raw.includes('g')) terms.add(greek.replace(/γ/g, 'γκ'));
    if (raw.includes('c')) terms.add(greek.replace(/ψ/g, 'κ').replace(/τσ/g, 'κ'));
  } else {
    const grToLat: Record<string, string> = {
      'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h', 'θ': 'th',
      'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
      'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'x', 'ψ': 'ps', 'ω': 'o',
    };
    let latin = '';
    for (let i = 0; i < raw.length; i++) latin += grToLat[raw[i]] || raw[i];
    terms.add(latin);
    if (raw.includes('χ')) {
      terms.add(latin.replace(/x/g, 'h'));
      terms.add(latin.replace(/x/g, 'ch'));
    }
    if (raw.includes('η')) terms.add(latin.replace(/h/g, 'i'));
    if (raw.includes('υ')) {
      terms.add(latin.replace(/y/g, 'u'));
      terms.add(latin.replace(/y/g, 'i'));
    }
    if (raw.includes('ω')) terms.add(latin.replace(/o/g, 'w'));
    if (raw.includes('β')) terms.add(latin.replace(/v/g, 'b'));
  }

  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    for (const group of SYNONYMS) {
      for (const syn of group) {
        if (term.includes(syn)) {
          for (const s of group) expanded.add(term.replace(syn, s));
        }
      }
    }
  }
  return Array.from(expanded);
}

export type SearchableDeal = {
  productName?: string | null;
  description?: string | null;
  category?: string | null;
  hotScore?: number | null;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '[^a-z0-9α-ωϊϋΐΰς]'; // not-a-word-char (normalized text)

// How strongly one term matches one deal. 0 = no match.
function termScore(term: string, name: string, rest: string): number {
  if (!term || term.length < 2) return 0;
  const t = escapeRe(term);
  if (new RegExp(`(^|${B})${t}(${B}|$)`).test(name)) return 100; // whole word in name
  if (new RegExp(`(^|${B})${t}`).test(name)) return 70;          // word-prefix in name
  if (name.includes(term)) return 35;                            // anywhere in name
  if (rest.includes(term)) return 10;                            // description/category only
  return 0;
}

export const CATEGORY_INTENT_BOOST = 50;

// Rank a candidate list for a query. Returns matches only, best first.
export function rankSearchResults<T extends SearchableDeal>(query: string, deals: T[]): T[] {
  const terms = expandSearch(query);
  if (terms.length === 0) return [];

  // What department does this query "mean"? Reuses the catalog categorizer, so
  // searching a staple boosts the rows that live where the staple lives.
  const intentDept = categorize(query);

  const scored: { deal: T; score: number }[] = [];
  for (const deal of deals) {
    const name = normalizeSearchText(deal.productName);
    const rest = `${normalizeSearchText(deal.description)} ${normalizeSearchText(deal.category)}`;
    let best = 0;
    for (const term of terms) {
      const s = termScore(term, name, rest);
      if (s > best) best = s;
    }
    if (best === 0) continue;
    if (intentDept !== 'Άλλο' && deal.category === intentDept) best += CATEGORY_INTENT_BOOST;
    best += Math.min(Math.max(deal.hotScore ?? 0, 0), 60) * 0.1; // popularity = tiebreak only
    scored.push({ deal, score: best });
  }

  return scored.sort((a, b) => b.score - a.score).map((x) => x.deal);
}
