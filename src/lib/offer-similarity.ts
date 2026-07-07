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

// Variant guard. Two offers can share every generic word + the same pack size
// and still be DIFFERENT products because they differ on one flavour / fat-level
// / type marker — "Lipton Ice Tea Lemon" vs "… Φράουλα", "Adoro Κρέμα Light" vs
// the regular one, "Γάλα Πλήρες" vs "Ελαφρύ". Jaccard dilutes that single
// differing token below notice, so we block any pair whose marker FAMILIES
// differ. Each family lists accent-stripped lowercase prefix roots in BOTH
// scripts (so latin "lemon" and Greek "λεμόνι" land in the same family and are
// NOT falsely split). A name "belongs to" a family if any of its word tokens
// starts with — or is a prefix of — one of the roots.
const MARKER_FAMILIES: string[][] = [
  ['lemon', 'λεμον'],
  ['fraoul', 'φραουλ', 'strawberr'],
  ['sokolat', 'chocolat', 'cacao', 'κακαο', 'choco'],
  ['vanil', 'βανιλ'],
  ['portokal', 'orange', 'πορτοκαλ'],
  ['rodakin', 'peach', 'ροδακιν'],
  ['verykok', 'βερυκοκ', 'apricot'],
  ['banan', 'μπαναν'],
  ['kerasi', 'κερασ', 'cherry'],
  ['ananas', 'ανανα', 'pineappl'],
  ['mango', 'μανγκ', 'μαγκο'],
  ['karyd', 'καρυδ', 'coconut', 'καρυδα'],
  ['mela', 'μηλο', 'apple', 'μηλ'],
  ['menta', 'μεντ', 'mint', 'δυοσμ'],
  ['kanel', 'cinnamon', 'κανελ'],
  ['karamel', 'caramel', 'καραμελ'],
  // Cosmetic / cleaning scent families — caught live 2026-07-07: Palmolive
  // κρεμοσάπουνο «Αμύγδαλο & Γάλα» rendered as comparable with «Μέλι & Γάλα».
  // Same trade-off as the flavour families above: a chain that omits the scent
  // word loses the pair (under-compare), never lies (mis-compare).
  ['meli', 'μελι', 'honey'],
  ['amygdal', 'αμυγδαλ', 'almond'],
  ['lavand', 'λεβαντ', 'lavender'],
  ['aloe', 'αλοη'],
  ['chamomil', 'χαμομηλ', 'χαμομιλ'],
  ['karpouz', 'καρπουζ', 'watermelon'],
  ['vatomour', 'βατομουρ', 'raspberr'],
  // fat / sugar / type — "light/ελαφρύ/ημιάπαχο/αποβουτυρωμένο" are one family
  // (reduced); "πλήρες/full" another; "zero" another.
  ['light', 'λαιτ', 'elafr', 'ελαφρ', 'imiapax', 'ημιαπαχ', 'apovoutyr', 'αποβουτυρ'],
  ['plir', 'πληρ', 'full'],
  ['zero', 'ζερο'],
  ['decaf', 'ντεκαφ'],
];

function rawWordTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .split(/[^a-z0-9α-ω]+/)
    .filter(Boolean);
}

function markerFamilies(name: string | null | undefined): Set<number> {
  const tokens = rawWordTokens(name);
  const fams = new Set<number>();
  MARKER_FAMILIES.forEach((roots, idx) => {
    for (const tok of tokens) {
      // ignore very short tokens to avoid spurious prefix hits ("με", "ro")
      if (tok.length < 3) continue;
      // Forward-prefix ONLY (token carries the root as its stem, tolerating Greek
      // inflection: "λεμονι".startsWith("λεμον")). The reverse direction let a
      // generic short word like "χωρίς" match a longer root and over-block.
      if (roots.some((r) => tok.startsWith(r))) { fams.add(idx); return; }
    }
  });
  return fams;
}

// True when the two names carry a DIFFERENT set of flavour/type markers — one
// is Lemon and the other Strawberry, or one is Light and the other is regular.
// Such pairs are different products even if every other word + the size match.
export function variantConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const fa = markerFamilies(a);
  const fb = markerFamilies(b);
  if (fa.size !== fb.size) return true;
  for (const f of fa) if (!fb.has(f)) return true;
  return false;
}

type Quantities = {
  massGrams: Set<number>;
  volumeMl: Set<number>;
  count: Set<number>;
};

function quantities(name: string | null | undefined): Quantities {
  const out: Quantities = {
    massGrams: new Set(),
    volumeMl: new Set(),
    count: new Set(),
  };
  if (!name) return out;
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ')
    // Diaper/clothing age-weight ranges are not product net quantities.
    .replace(/\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?\s*(?:kg|κιλ\w*|gr|g|γρ\w*)/g, ' ');

  const massRe = /(\d+(?:[.,]\d+)?)\s*(kg|κιλ\w*|gr|g(?=[^a-zα-ω]|$)|γρ\w*)/g;
  const volumeRe = /(\d+(?:[.,]\d+)?)\s*(ml|cl|lt|l(?=[^a-zα-ω]|$)|λτ|λιτρ\w*)/g;
  const countRe = /(\d{1,3})\s*(?:τεμαχ\w*|τεμ(?=[^a-zα-ω]|$)|τμχ|pcs|μεζ\w*|mez|πλυσ\w*|ρολ\w*)/g;

  let match: RegExpExecArray | null;
  while ((match = massRe.exec(normalized))) {
    const value = parseFloat(match[1].replace(',', '.'));
    out.massGrams.add(match[2] === 'kg' || match[2].startsWith('κιλ') ? value * 1000 : value);
  }
  while ((match = volumeRe.exec(normalized))) {
    const value = parseFloat(match[1].replace(',', '.'));
    const unit = match[2];
    const ml = unit === 'ml' ? value
      : unit === 'cl' ? value * 10
        : value * 1000;
    out.volumeMl.add(ml);
  }
  while ((match = countRe.exec(normalized))) {
    out.count.add(parseInt(match[1], 10));
  }
  return out;
}

function disjointWhenBothPresent(a: Set<number>, b: Set<number>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const value of a) if (b.has(value)) return false;
  return true;
}

// Different declared net quantities are different sellable items. If one name
// omits quantity entirely we stay permissive because canonical names are often
// abbreviated; conflict requires both sides to state incompatible values.
export function quantityConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const qa = quantities(a);
  const qb = quantities(b);
  return disjointWhenBothPresent(qa.massGrams, qb.massGrams)
    || disjointWhenBothPresent(qa.volumeMl, qb.volumeMl)
    || disjointWhenBothPresent(qa.count, qb.count);
}

// Below this, two offers joined by productId are treated as different products
// and hidden from comparison. Deliberately strict: a hidden legit comparison
// costs us a feature; a shown wrong one costs us the user's trust.
export const COMPARISON_SIMILARITY_FLOOR = 0.5;

export function areComparableNames(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return !variantConflict(a, b)
    && !quantityConflict(a, b)
    && nameSimilarity(a, b) >= COMPARISON_SIMILARITY_FLOOR;
}

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
  const scored = candidates
    // Drop anything that differs on a flavour/fat/type marker BEFORE scoring —
    // a single differing variant token (Lemon vs Φράουλα, Light vs regular)
    // makes them different products even at a high Jaccard score.
    .filter((c) => !variantConflict(sourceName, getName(c))
      && !quantityConflict(sourceName, getName(c)))
    .map((c) => ({
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
