// Name-similarity guard for cross-chain price comparison.
//
// The comparison/alternatives actions join offers on a shared canonical
// productId. Stale mis-mappings (several chain SKUs pointing at one product —
// e.g. NESCAFE Gold / Organic / Rich Caramel 95g all on one productId) made
// "ΣΥΓΚΡΙΣΗ ΤΙΜΗΣ" show *different* products as if they were the same one.
// samePack() can't catch these (same pack size). This module scores how alike
// two offer names actually are, so obviously-different products never render
// together even while the underlying mapping data is being cleaned up.
//
// Pure + strip-safe so .mjs scripts and .ts server actions can both import it.

// Two-char digraphs must be tried before single letters.
const LATIN_DIGRAPHS: Array<[string, string]> = [
  ['th', 'θ'], ['ch', 'χ'], ['ps', 'ψ'], ['ou', 'ου'], ['mp', 'μπ'],
  ['nt', 'ντ'], ['gk', 'γκ'],
];
const LATIN_SINGLE: Record<string, string> = {
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', i: 'ι',
  k: 'κ', l: 'λ', m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π', r: 'ρ',
  s: 'σ', t: 'τ', u: 'υ', y: 'υ', f: 'φ', v: 'β', w: 'ω', q: 'κ',
  c: 'κ', j: 'τζ',
};

// Latin-script tokens are transliterated to Greek so "NESCAFE" and "ΝΕΣΚΑΦΕ"
// (or "VERGINA" / "ΒΕΡΓΙΝΑ") count as the same token across chains.
function latinToGreek(token: string): string {
  let out = '';
  let i = 0;
  while (i < token.length) {
    const two = token.slice(i, i + 2);
    const digraph = LATIN_DIGRAPHS.find(([l]) => l === two);
    if (digraph) { out += digraph[1]; i += 2; continue; }
    const one = LATIN_SINGLE[token[i]];
    out += one ?? token[i];
    i += 1;
  }
  return out;
}

// "280γρ" / "280gr" / "280g" → "280g"; "1lt" / "1λτ" → "1l" — size tokens are
// salient (95g vs 200g IS a different product) but spelling must not matter.
const UNIT_CANON: Record<string, string> = {
  γρ: 'g', gr: 'g', g: 'g', κιλο: 'kg', kg: 'kg',
  ml: 'ml', μλ: 'ml', cl: 'cl',
  lt: 'l', λτ: 'l', l: 'l', λιτρα: 'l', λιτρο: 'l',
  τεμ: 'τεμ', tem: 'τεμ', τμχ: 'τεμ', μεζ: 'μεζ', mez: 'μεζ',
};
const UNIT_TOKEN_RE = /^(\d+(?:[.,]\d+)?)([a-zα-ω]+)$/;

export function salientTokens(name: string | null | undefined): Set<string> {
  if (!name) return new Set();
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    // "6x330ml" / "2*1lt" → "6 330ml" — the multiplier glues two size tokens.
    .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1 ')
    .replace(/[^a-z0-9α-ω]+/g, ' ');

  const out = new Set<string>();
  for (const raw of cleaned.split(' ')) {
    if (!raw) continue;
    let token = raw;
    const unit = token.match(UNIT_TOKEN_RE);
    if (unit) {
      const canon = UNIT_CANON[unit[2]];
      if (canon) {
        let num = parseFloat(unit[1].replace(',', '.'));
        let u = canon;
        // "1000ml" and "1lt" are the same size — express big ml in liters.
        if (u === 'ml' && num >= 1000) { num = num / 1000; u = 'l'; }
        token = `${num}${u}`;
      }
    }
    // Short tokens are noise ("με", "σε") unless they carry a number (sizes,
    // counts — "95g", "2", "No4").
    if (token.length < 3 && !/\d/.test(token)) continue;
    if (/^[a-z0-9]+$/.test(token) && /[a-z]/.test(token) && !/\d/.test(token)) {
      token = latinToGreek(token);
    }
    out.add(token);
  }
  return out;
}

// Two tokens count as the same word when equal OR one is a prefix of the
// other — Greek inflection ("Όγκος"/"Όγκο"), chain abbreviations ("ΦΙΛ."/
// "Φιλέτο"), and EN/EL morphology ("Condition"/"Conditioner") all differ only
// in the tail. Both tokens are ≥3 chars by construction, which keeps this from
// over-matching.
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  // Prefix-equivalence is for WORDS only — number-bearing tokens (sizes,
  // counts) must agree exactly ("2" must not match "250ml").
  if (/\d/.test(a) || /\d/.test(b)) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// Jaccard over salient tokens. Symmetric; 1 = same name, 0 = nothing shared.
// Unshared tokens *penalize* (unlike overlap-coefficient) — that's what
// separates "… Gold …" from "… Rich Caramel …" when the generic words match.
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = [...salientTokens(a)];
  const tb = [...salientTokens(b)];
  if (ta.length === 0 || tb.length === 0) return 0;
  const used = new Array(tb.length).fill(false);
  let shared = 0;
  for (const t of ta) {
    // Exact match first so a prefix doesn't steal another token's twin.
    let j = tb.findIndex((u, i) => !used[i] && u === t);
    if (j === -1) j = tb.findIndex((u, i) => !used[i] && sameWord(t, u));
    if (j !== -1) { used[j] = true; shared += 1; }
  }
  const union = ta.length + tb.length - shared;
  return union === 0 ? 0 : shared / union;
}

// Below this, two offers joined by productId are treated as different products
// and hidden from comparison. Deliberately strict: a hidden legit comparison
// costs us a feature; a shown wrong one costs us the user's trust.
export const COMPARISON_SIMILARITY_FLOOR = 0.5;

// Candidates within this much of their chain's best score are kept alongside
// it (same product can legitimately appear twice per chain as web + leaflet
// rows — identical names, equal scores).
const CHAIN_BEST_EPSILON = 0.05;

// Filter productId-joined comparison candidates down to the ones that are
// plausibly the SAME product as the source offer:
//   1. score every candidate's name against the source offer's name;
//   2. per chain, keep only the best-scoring candidate (± epsilon) — one chain
//      sells one instance of a product, so several differently-named rows on
//      one productId are ipso facto a mis-mapping;
//   3. drop anything under the similarity floor.
export function filterComparable<T>(
  sourceName: string | null | undefined,
  candidates: T[],
  getName: (c: T) => string | null | undefined,
  getChain: (c: T) => string | null | undefined
): T[] {
  const scored = candidates.map((c) => ({
    c,
    chain: getChain(c) ?? '',
    score: nameSimilarity(sourceName, getName(c)),
  }));
  const chainBest = new Map<string, number>();
  for (const s of scored) {
    if (s.score > (chainBest.get(s.chain) ?? -1)) chainBest.set(s.chain, s.score);
  }
  return scored
    .filter((s) => s.score >= COMPARISON_SIMILARITY_FLOOR
      && s.score >= (chainBest.get(s.chain) ?? 0) - CHAIN_BEST_EPSILON)
    .map((s) => s.c);
}
