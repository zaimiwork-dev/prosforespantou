// Word-identical store listings (2026-11-23, owner: «nescafe classic only in
// galaxias and bazaar … an item that is on every supermarket»).
//
// Two stores often write the very same product with only spelling differences:
// «NESCAFÉ® CLASSIC ΣΤΙΓΜΙΑΙΟΣ ΚΑΦΕΣ 200g» vs «Nescafe Classic Καφές Στιγμιαίος
// 200γρ.». After folding (case, accents, ®, punctuation, word order, unit
// spelling — product-linker's parseName) they are the same words and the same
// stated size. Such a pair needs no judge: it is recorded as a link with model
// 'name-exact'. Anything with one extra or missing word («Decaf», «Classic»
// left out, a different size) is NOT word-identical and goes to the judge.
//
// Hand check 2026-11-23: 60 of 60 random word-identical pairs were the same
// product (.local-scratch/LINK-1123/exact.mjs).
//
// Explicit .ts extension: imported by node-run scripts (verify-comparisons.mjs).
import { parseName, compareSizes } from './product-linker.ts';

const wordKey = (name: string): { key: string; n: number; size: ReturnType<typeof parseName>['size'] } => {
  const p = parseName(name);
  const keys = [...new Set(p.tokens.map((t) => t.key))].sort();
  return { key: keys.join(' '), n: keys.length, size: p.size };
};

/** Same words and the same stated size, after folding. Both names must state a size. */
export function sameWordsAndSize(nameA: string | null | undefined, nameB: string | null | undefined): boolean {
  if (!nameA || !nameB) return false;
  const a = wordKey(nameA);
  const b = wordKey(nameB);
  // A brand plus at least one more word: «Lacta 85g» alone says too little.
  if (a.n < 2 || b.n < 2) return false;
  if (compareSizes(a.size, b.size) !== 'same') return false;
  return a.key === b.key;
}

/**
 * Does the name state the brand on record? AB leaves the brand out of its
 * names («Φρέσκο Γάλα Πλήρες 1lt» is ΔΕΛΤΑ), so two brandless names can be
 * word-identical and still be two brands (a store's own label). Compared by
 * sound (parseName keys), so «ION» = «ΙΟΝ». Unknown or unreadable brand → false.
 */
export function statesBrand(name: string | null | undefined, brand: string | null | undefined): boolean {
  if (!name || !brand) return false;
  const brandKey = parseName(brand).tokens[0]?.key;
  if (!brandKey) return false;
  return parseName(name).tokens.some((t) => t.key === brandKey);
}

/** First-word sound keys of every known brand (products.brand), for brandOk(). */
export function brandKeySet(brands: Iterable<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const b of brands) {
    const k = b ? parseName(b).tokens[0]?.key : undefined;
    if (k) out.add(k);
  }
  return out;
}

type LinkSide = { name?: string | null; brand?: string | null };

// A side's brand is accounted for when its name states the brand on record,
// or — for the many products with no brand on record (~900 of the first 2,078
// word-identical links, all right) — when the name STARTS with a known brand.
// A name starting with a plain word («Φρέσκο Γάλα Πλήρες 1lt») never qualifies,
// so two stores' own-label goods cannot link without a judge.
function brandOk(side: LinkSide, brandKeys: Set<string> | null): boolean {
  if (side.brand) return statesBrand(side.name, side.brand);
  const first = parseName(side.name).tokens[0]?.key;
  return !!first && !!brandKeys && brandKeys.has(first);
}

/** A link that needs no judge: word-identical, and each side's brand accounted for. */
export function wordIdenticalLink(a: LinkSide, b: LinkSide, brandKeys: Set<string> | null = null): boolean {
  return sameWordsAndSize(a.name, b.name) && brandOk(a, brandKeys) && brandOk(b, brandKeys);
}
