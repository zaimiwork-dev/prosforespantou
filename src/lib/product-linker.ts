// Cross-chain product linker (LINK-01) — decides whether two chain-side names
// describe the SAME sellable product, without barcodes.
//
// Why it exists: the product page compares an offer with the same product at
// other chains, but cross-chain linking relies on barcodes and most chains
// publish few. Loosening the old guards would join genuinely different items
// (toothpaste vs toothbrush), so this module is built as VETOES first (size,
// pack, variant, brand, department, price) and a SOFT SCORE second. A pair that
// trips any veto never links, whatever the score.
//
// Pure + strip-safe (no enums/namespaces/decorators); explicit .ts relative
// imports so the .mjs scripts can import it straight into Node.
//
// This module only PROPOSES. Applying a link to live data is a separate,
// owner-approved step.

import { variantConflict } from './offer-similarity.ts';
import { categorize } from './categories.ts';

// ───────────────────────── text normalisation ─────────────────────────

/** Lower-case, accent/diaeresis-free, final sigma folded, apostrophes dropped. */
export function foldText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/['’‘`´^]/g, '')
    // «Χ.ΖΑΧΑΡΗ», «Χ.ΛΑΚΤΟΖΗ» = χωρίς …
    .replace(/(^|[s(])χ.s*(?=[a-zα-ω])/g, '$1χωρις ');
}

// Latin letters identical to Greek ones, repaired inside MIXED-script words
// only («ΝΩMA» with a Latin M). Pure Latin words are never touched.
const HOMOGLYPH: Record<string, string> = {
  a: 'α', b: 'β', e: 'ε', h: 'η', i: 'ι', k: 'κ', m: 'μ', n: 'ν',
  o: 'ο', p: 'ρ', t: 'τ', u: 'υ', v: 'ν', x: 'χ', y: 'υ', z: 'ζ',
};
function fixMixedScript(word: string): string {
  if (!/[α-ω]/.test(word) || !/[a-z]/.test(word)) return word;
  let out = '';
  for (const ch of word) out += HOMOGLYPH[ch] ?? ch;
  return out;
}

const GREEK_DIGRAPHS: Array<[string, string]> = [
  ['ου', 'u'], ['αι', 'e'], ['ει', 'i'], ['οι', 'i'], ['υι', 'i'],
  ['μπ', 'b'], ['ντ', 'd'], ['γκ', 'g'], ['γγ', 'g'], ['τσ', 'ts'], ['τζ', 'dz'],
  ['αυ', 'af'], ['ευ', 'ef'], ['θ', 't'], ['ψ', 'ps'], ['ξ', 'ks'], ['χ', 'h'],
];
const GREEK_SINGLE: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', ι: 'i', κ: 'k', λ: 'l',
  μ: 'm', ν: 'n', ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't', υ: 'i', φ: 'f', ω: 'o',
};
const LATIN_DIGRAPHS: Array<[string, string]> = [
  ['ou', 'u'], ['ai', 'e'], ['ei', 'i'], ['oi', 'i'], ['ph', 'f'], ['th', 't'],
  ['ch', 'h'], ['kh', 'h'], ['ck', 'k'], ['ts', 'ts'], ['mp', 'b'], ['nt', 'd'],
  ['gk', 'g'], ['gg', 'g'], ['ps', 'ps'], ['au', 'af'], ['eu', 'ef'],
];
const LATIN_SINGLE: Record<string, string> = {
  a: 'a', b: 'b', c: 'k', d: 'd', e: 'e', f: 'f', g: 'g', h: 'h', i: 'i', j: 'dz',
  k: 'k', l: 'l', m: 'm', n: 'n', o: 'o', p: 'p', q: 'k', r: 'r', s: 's', t: 't',
  u: 'u', v: 'v', w: 'v', x: 'ks', y: 'i', z: 'z',
};

/**
 * Script-independent sound key: «ΔΕΛΤΑ» and «Delta», «ΝΕΣΚΑΦΕ» and «Nescafe»,
 * «Βεργίνα» and «Vergina» all land on the same key. Digits pass through.
 */
export function phoneticKey(word: string): string {
  const w = fixMixedScript(word);
  const greek = /[α-ω]/.test(w);
  const digraphs = greek ? GREEK_DIGRAPHS : LATIN_DIGRAPHS;
  const single = greek ? GREEK_SINGLE : LATIN_SINGLE;
  let out = '';
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    const d = digraphs.find(([k]) => k === two) ?? digraphs.find(([k]) => k.length === 1 && k === w[i]);
    if (d) { out += d[1]; i += d[0].length; continue; }
    out += single[w[i]] ?? w[i];
    i += 1;
  }
  // v and f are one class (Greek β=v, Latin v/f spelling drift); collapse runs.
  out = out.replace(/v/g, 'f');
  return out.replace(/(.)\1+/g, '$1');
}

// ───────────────────────── sizes and packs ─────────────────────────

export type SizeDim = 'g' | 'ml' | 'pc' | 'dose';
export type SizeFact = {
  dim: SizeDim;
  /** one unit, in g / ml / pieces / doses */
  unit: number;
  /** how many of that unit the name says are in the pack (multipack, N+M gift) */
  count: number;
  /** unit * count */
  total: number;
};

const NUM = '(\\d+(?:[.,]\\d+)?)';
const MASS_U = '(kgr?|κιλο\\w*|κιλ|κ\\.?γ|γρ\\w*|gr\\w*|gm|g|mg)';
const VOL_U = '(ml|μλ|cl|lt|ltr|λτ|λιτρ\\w*|l)';
const ANY_U = `(?:${MASS_U.slice(1, -1)}|${VOL_U.slice(1, -1)})`;
const AFTER = '(?![a-zα-ω])';

const RANGE_RE = new RegExp(`\\d+(?:[.,]\\d+)?\\s*[-–]\\s*\\d+(?:[.,]\\d+)?\\s*${ANY_U}${AFTER}`, 'g');
// «6x330ml», «6 * 330 ml», «12χ250γρ»
const MULTI_RE = new RegExp(`(?<![a-zα-ω0-9.,])(\\d{1,3})\\s*[x×*χ]\\s*${NUM}\\s*(${ANY_U})${AFTER}`, 'g');
// «330ml x 6», «250γρ*4»
const MULTI_REV_RE = new RegExp(`${NUM}\\s*(${ANY_U})\\s*[x×*χ]\\s*(\\d{1,3})(?![\\d.,a-zα-ω])`, 'g');
const SINGLE_RE = new RegExp(`(?<![a-zα-ω0-9.,])${NUM}\\s*(${ANY_U})${AFTER}`, 'g');
// «9+3 Δώρο», «(5+1)Δ», «2+1 ΔΩΡΟ»
const GIFT_RE = /(?<![a-zα-ω0-9.,+])(\d{1,2})\s*\+\s*(\d{1,2})\s*\)?\s*(?:δωρο|δ(?![a-zα-ω])|free|gratis|δωρεαν)/g;
const PIECES_RE = /(?<![a-zα-ω0-9.,x*])(\d{1,3})\s*(τεμαχι\w*|τεμ|τμχ|τ(?![a-zα-ω0-9])|pcs|pc|ρολ\w*|φακελ\w*|φακ(?![a-zα-ω])|κουτ\w*|capsules|καψουλ\w*|caps(?![a-zα-ω])|ταμπον\w*|σερβιετ\w*|δισκ\w*|tabs?(?![a-zα-ω])|ταμπλετ\w*|σακουλ\w*|t(?![a-z0-9]))/g;
const DOSE_RE = /(?<![a-zα-ω0-9.,])(\d{1,3})\s*(μεζ\w*|mez\w*|πλυσ\w*|πλυσεισ|doses|washes)/g;
// Count words that are part of the product (not a pack count): «κουτί» as a
// can is handled by the multipack syntax; a bare «κουτ» is not trusted for
// piece counts, only the real piece words are.
const PIECE_WORDS = /^(τεμαχι\w*|τεμ|τμχ|τ|pcs|pc|ρολ\w*|φακελ\w*|φακ|capsules|καψουλ\w*|caps|ταμπον\w*|σερβιετ\w*|δισκ\w*|tab|tabs|ταμπλετ\w*|t)$/;

const num = (s: string) => parseFloat(s.replace(',', '.'));

function toBase(value: number, unitRaw: string): { dim: 'g' | 'ml'; v: number } | null {
  const u = unitRaw;
  if (/^(kgr?|κιλ|κ\.?γ)/.test(u) || u.startsWith('κιλο')) return { dim: 'g', v: value * 1000 };
  if (u === 'mg') return { dim: 'g', v: value / 1000 };
  if (/^(γρ|gr|gm)/.test(u) || u === 'g') return { dim: 'g', v: value };
  if (u === 'ml' || u === 'μλ') return { dim: 'ml', v: value };
  if (u === 'cl') return { dim: 'ml', v: value * 10 };
  if (/^(lt|ltr|λτ|λιτρ)/.test(u) || u === 'l') return { dim: 'ml', v: value * 1000 };
  return null;
}

export type ParsedSize = {
  sizes: SizeFact[];
  /** pieces stated outright («30τεμ», 4x12τεμ = 48), null if the name is silent */
  pieces: number | null;
  /** multipack / gift multiplier (1 when the name says nothing) */
  packCount: number;
  /** fat / alcohol style percentages: «2%», «40%» */
  percents: number[];
  /** text with all size/pack fragments blanked out, ready for tokenising */
  rest: string;
};

/** Parse every quantity fact out of an already-folded name. */
export function parseSize(folded: string): ParsedSize {
  let text = ' ' + folded.replace(RANGE_RE, ' ') + ' ';
  const sizes: SizeFact[] = [];
  let packCount = 1;
  let pieces: number | null = null;

  // gift multibuy first: it multiplies a per-unit size that follows/precedes.
  let giftCount = 1;
  text = text.replace(GIFT_RE, (_m, a: string, b: string) => {
    giftCount = parseInt(a, 10) + parseInt(b, 10);
    return ' ';
  });

  text = text.replace(MULTI_RE, (_m, n: string, v: string, u: string) => {
    const base = toBase(num(v), u);
    const count = parseInt(n, 10);
    if (base && count >= 1) sizes.push({ dim: base.dim, unit: base.v, count, total: base.v * count });
    return ' ';
  });
  text = text.replace(MULTI_REV_RE, (_m, v: string, u: string, n: string) => {
    const base = toBase(num(v), u);
    const count = parseInt(n, 10);
    if (base && count >= 1) sizes.push({ dim: base.dim, unit: base.v, count, total: base.v * count });
    return ' ';
  });
  // «6x12τεμ»-style multipacks of pieces
  text = text.replace(/(?<![a-zα-ω0-9.,])(\d{1,3})\s*[x×*χ]\s*(\d{1,3})\s*(?=τεμ|τμχ|ρολ|pcs|φακελ)/g, (_m, a: string, b: string) => {
    pieces = parseInt(a, 10) * parseInt(b, 10);
    return ' ';
  });
  text = text.replace(SINGLE_RE, (_m, v: string, u: string) => {
    const base = toBase(num(v), u);
    if (base) sizes.push({ dim: base.dim, unit: base.v, count: 1, total: base.v });
    return ' ';
  });
  text = text.replace(DOSE_RE, (_m, n: string) => {
    const d = parseInt(n, 10);
    if (d >= 2) sizes.push({ dim: 'dose', unit: d, count: 1, total: d });
    return ' ';
  });
  text = text.replace(PIECES_RE, (_m, n: string, w: string) => {
    const p = parseInt(n, 10);
    if (PIECE_WORDS.test(w) && p >= 2 && p <= 500 && pieces === null) pieces = p;
    return PIECE_WORDS.test(w) ? ' ' : _m;
  });

  if (giftCount > 1) {
    // gift bundle multiplies the (single-unit) size that was stated
    if (sizes.length > 0 && sizes[0].count === 1) {
      sizes[0] = { ...sizes[0], count: giftCount, total: sizes[0].unit * giftCount };
    }
    packCount = giftCount;
  } else {
    const multi = sizes.find((s) => s.count > 1);
    if (multi) packCount = multi.count;
  }

  const percents: number[] = [];
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_m, p: string) => {
    percents.push(num(p));
    return ' ';
  });

  return { sizes, pieces, packCount, percents, rest: text };
}

const REL_TOL = 0.015;
const closeTo = (a: number, b: number) => Math.abs(a - b) <= REL_TOL * Math.max(a, b);

/**
 * 'same'     every dimension both names state agrees
 * 'conflict' a dimension both names state disagrees (different sellable item)
 * 'unknown'  nothing comparable (one or both silent / different dimensions)
 */
export function compareSizes(a: ParsedSize, b: ParsedSize): 'same' | 'conflict' | 'unknown' {
  let agreed = false;
  for (const dim of ['g', 'ml', 'dose'] as const) {
    const sa = a.sizes.filter((s) => s.dim === dim);
    const sb = b.sizes.filter((s) => s.dim === dim);
    if (!sa.length || !sb.length) continue;
    const hit = sa.some((x) => sb.some((y) => closeTo(x.total, y.total) && x.count === y.count));
    if (!hit) return 'conflict';
    agreed = true;
  }
  if (a.pieces !== null && b.pieces !== null) {
    if (a.pieces !== b.pieces) return 'conflict';
    agreed = true;
  }
  // multipack factor: a stated multipack must meet the same factor (or silence
  // is NOT enough when the other side states a size with count 1 — the totals
  // above already caught that case).
  if (a.packCount !== b.packCount && a.sizes.length > 0 && b.sizes.length > 0) return 'conflict';
  if (a.percents.length && b.percents.length) {
    if (!a.percents.some((p) => b.percents.includes(p))) return 'conflict';
  }
  return agreed ? 'same' : 'unknown';
}

// ───────────────────────── tokens, brand, type ─────────────────────────

// Words that carry no product identity. Packaging words differ by chain
// («ΚΟΥΤΙ», «ΦΙΑΛΗ»); fillers are Greek/English function words.
const STOPWORDS = new Set([
  'με', 'και', 'για', 'σε', 'απο', 'του', 'της', 'των', 'τον', 'την', 'στο', 'στη',
  'στην', 'στα', 'the', 'and', 'with', 'of', 'new', 'νεο', 'νεα', 'νεος', 'προσφορα',
  'συσκευασια', 'συσκ', 'κουτι', 'φιαλη', 'μπουκαλι', 'πακετο', 'συσκευασιασ',
  'τεμ', 'τεμαχια', 'τμχ', 'pack', 'ειδοσ', 'ειδη', 'ν', 'x', 'no', 'νο',
  'δωρο', 'δωρεαν', 'μικτο', 'ιδιωτικη', 'ετικετα', 'εκπτωση', 'ευρω', 'κιλο',
  'ελληνικο', 'ελληνικη', 'ελληνικος', 'ελλαδοσ', 'εν',
]);

export type LinkContext = {
  /** phonetic keys of known brands (first one or two words) — optional */
  brandKeys?: Set<string>;
  /** token key → weight (idf-like). Missing tokens weigh 1 — optional */
  weights?: Map<string, number>;
};

/** Build the optional corpus context from all names and the known brand strings. */
export function buildLinkContext(names: Iterable<string>, brands: Iterable<string> = []): LinkContext {
  const brandKeys = new Set<string>();
  for (const b of brands) {
    const toks = foldText(b).split(/[^a-z0-9α-ω]+/).filter((t) => t.length >= 2);
    if (!toks.length) continue;
    brandKeys.add(phoneticKey(toks[0]));
    if (toks.length >= 2) brandKeys.add(phoneticKey(toks[0]) + ' ' + phoneticKey(toks[1]));
  }
  const df = new Map<string, number>();
  let n = 0;
  for (const name of names) {
    n += 1;
    const seen = new Set<string>();
    for (const t of tokenize(foldText(name))) seen.add(t.key);
    for (const k of seen) df.set(k, (df.get(k) ?? 0) + 1);
  }
  const weights = new Map<string, number>();
  const maxIdf = Math.log(n + 1);
  for (const [k, c] of df) weights.set(k, 0.4 + 0.6 * (Math.log((n + 1) / (c + 1)) / maxIdf));
  return { brandKeys, weights };
}

export type Token = { word: string; key: string };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  // «ΧΑΡΤΟΜ/ΛΑ», «ΑΠΟΤΡΙΧ/ΚΗ»: split on slash, short remnants fall away below.
  for (const raw of text.split(/[^a-z0-9α-ω]+/)) {
    if (!raw) continue;
    const word = fixMixedScript(raw);
    if (STOPWORDS.has(word)) continue;
    if (word.length < 2 && !/\d/.test(word)) continue;
    const key = phoneticKey(word);
    if (!key) continue;
    out.push({ word, key });
  }
  return out;
}

export type ParsedName = {
  raw: string;
  folded: string;
  size: ParsedSize;
  /** all identity tokens in order (size/pack fragments removed) */
  tokens: Token[];
  /** the brand guess: lexicon brand, else the first token */
  brand: string | null;
  /** tokens minus the brand (what kind of product it is, which variant) */
  rest: Token[];
  dept: string;
};

export function parseName(name: string | null | undefined, ctx: LinkContext = {}): ParsedName {
  const raw = name ?? '';
  const folded = foldText(raw);
  const size = parseSize(folded);
  const tokens = tokenize(size.rest);
  let brand: string | null = null;
  let brandLen = 0;
  if (tokens.length) {
    if (tokens.length >= 2 && ctx.brandKeys?.has(tokens[0].key + ' ' + tokens[1].key)) {
      brand = tokens[0].key + ' ' + tokens[1].key;
      brandLen = 2;
    } else {
      brand = tokens[0].key;
      brandLen = 1;
    }
  }
  const dept = raw ? categorize(raw) : 'Άλλο';
  return { raw, folded, size, tokens, brand, rest: tokens.slice(brandLen), dept };
}

// Two keys are the same word when equal, or one is a prefix of the other
// (Greek inflection, chain truncation «ΑΠΟΤΡΙΧ.» / «Αποτριχωτική»). Numbers
// must match exactly.
function sameKey(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 3 && l.startsWith(s);
}

function brandMatches(a: ParsedName, b: ParsedName): boolean {
  if (!a.brand || !b.brand) return false;
  const ak = a.brand.split(' ');
  const bk = b.brand.split(' ');
  // the brand of one side must appear among the other side's tokens — brand
  // position varies by chain («Καφές Nescafe» vs «Nescafe Καφές»).
  const inOther = (keys: string[], other: ParsedName) =>
    keys.every((k) => other.tokens.some((t) => sameKey(k, t.key)));
  return inOther(ak, b) || inOther(bk, a);
}

// ───────────────────────── scoring ─────────────────────────

export type LinkItem = {
  name: string;
  chain?: string | null;
  price?: number | null;
  /** epoch ms of the price, when known (price veto only compares near dates) */
  at?: number | null;
};

export type LinkResult = {
  score: number;
  veto: string | null;
  reasons: string[];
};

export const PRICE_RATIO_VETO = 3;
const PRICE_WINDOW_MS = 60 * 24 * 3600 * 1000;

function weightOf(ctx: LinkContext, key: string): number {
  return ctx.weights?.get(key) ?? 1;
}

type Match = { covA: number; covB: number; jaccard: number; unmatchedA: Token[]; unmatchedB: Token[] };

function matchTokens(a: Token[], b: Token[], ctx: LinkContext): Match {
  const used = new Array(b.length).fill(false);
  let shared = 0;
  let totA = 0;
  let totB = 0;
  const unmatchedA: Token[] = [];
  for (const t of a) {
    const w = weightOf(ctx, t.key);
    totA += w;
    let j = b.findIndex((u, i) => !used[i] && u.key === t.key);
    if (j === -1) j = b.findIndex((u, i) => !used[i] && sameKey(t.key, u.key));
    if (j !== -1) { used[j] = true; shared += w; } else unmatchedA.push(t);
  }
  const unmatchedB: Token[] = [];
  b.forEach((u, i) => {
    const w = weightOf(ctx, u.key);
    totB += w;
    if (!used[i]) unmatchedB.push(u);
  });
  const union = totA + totB - shared;
  return {
    covA: totA ? shared / totA : 0,
    covB: totB ? shared / totB : 0,
    jaccard: union ? shared / union : 0,
    unmatchedA,
    unmatchedB,
  };
}

/** Score a pair of already-parsed names. Prefer scoreLink() unless you cache parses. */
export function scoreParsed(
  pa: ParsedName,
  pb: ParsedName,
  ia: LinkItem,
  ib: LinkItem,
  ctx: LinkContext = {},
): LinkResult {
  const reasons: string[] = [];
  const veto = (v: string): LinkResult => ({ score: 0, veto: v, reasons: [...reasons, `veto:${v}`] });

  if (!pa.tokens.length || !pb.tokens.length) return veto('empty');

  // 1. size / pack — a different size or pack is a different sellable item.
  const sz = compareSizes(pa.size, pb.size);
  if (sz === 'conflict') return veto('size');

  // 2. variant markers (flavour, fat level, decaf, …)
  if (variantConflict(pa.raw, pb.raw)) return veto('variant');

  // 3. department
  if (pa.dept !== pb.dept && pa.dept !== 'Άλλο' && pb.dept !== 'Άλλο') return veto('department');

  // 4. price ratio at a similar date
  const pr = ia.price ?? null;
  const qr = ib.price ?? null;
  if (pr && qr && pr > 0 && qr > 0) {
    const near = ia.at == null || ib.at == null || Math.abs(ia.at - ib.at) <= PRICE_WINDOW_MS;
    if (near && Math.max(pr, qr) / Math.min(pr, qr) > PRICE_RATIO_VETO) return veto('price');
  }

  // 5. brand
  const brandOk = brandMatches(pa, pb);
  if (!brandOk) return veto('brand');
  reasons.push('brand');

  // 6. type / variant tokens left over after brand
  const m = matchTokens(pa.rest, pb.rest, ctx);
  const minCov = Math.min(m.covA, m.covB);
  const maxCov = Math.max(m.covA, m.covB);
  const emptyRest = pa.rest.length === 0 || pb.rest.length === 0;
  let score = emptyRest ? 0.5 : 0.35 * minCov + 0.4 * maxCov + 0.25 * m.jaccard;

  // Both sides carry words the other lacks → likely different variants.
  const bothExtra = m.unmatchedA.length > 0 && m.unmatchedB.length > 0;
  if (bothExtra) {
    const wA = m.unmatchedA.reduce((s, t) => s + weightOf(ctx, t.key), 0);
    const wB = m.unmatchedB.reduce((s, t) => s + weightOf(ctx, t.key), 0);
    score -= 0.08 * Math.min(2, Math.min(wA, wB));
    reasons.push('both-sides-extra-words');
  }

  if (sz === 'same') { score += 0.12; reasons.push('size-agrees'); }
  else {
    const hasA = pa.size.sizes.length > 0 || pa.size.pieces !== null;
    const hasB = pb.size.sizes.length > 0 || pb.size.pieces !== null;
    if (hasA && hasB) { score -= 0.1; reasons.push('size-dims-differ'); }
    else if (hasA || hasB) { score -= 0.1; reasons.push('size-one-side-silent'); }
    else { score -= 0.05; reasons.push('size-both-silent'); }
  }
  reasons.push(`cov=${minCov.toFixed(2)}/${maxCov.toFixed(2)}`);
  return { score: Math.max(0, Math.min(1, score)), veto: null, reasons };
}

export function scoreLink(a: LinkItem, b: LinkItem, ctx: LinkContext = {}): LinkResult {
  return scoreParsed(parseName(a.name, ctx), parseName(b.name, ctx), a, b, ctx);
}
