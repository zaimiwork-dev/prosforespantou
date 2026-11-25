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
