// Barcodes → proven cross-store matches (owner 2026-11-23: «saved with their
// TINs or whatever code the item has … or barcode … anywhere we get the items
// from»). Pure; src/scripts/barcode-links.mjs does the reading and writing.
//
// Two steps, both deterministic — no AI, no guessing:
// 1. ATTACH: a barcode listing from a source that is not the store itself
//    (Wolt) names the store's item only by its NAME. It is attached to the
//    store's own item code when the normalised names are EXACTLY equal, within
//    the SAME store, and the name is unique on both sides (one item of that
//    store has it, and every listing with it carries the same barcode).
// 2. PAIR: two stores' items carrying the same barcode are the same product —
//    each such pair becomes a 'same' verdict with model 'barcode' (final; see
//    lib/comparison-verdict). A barcode claimed by too many items of one store
//    is ignored as suspect rather than fanned out into wrong links.
//
// Explicit .ts-free imports: this module is imported by a node-run script.

export type BarcodeListing = {
  id: string;
  chain: string;
  name: string;
  barcode: string;
  chainItemcode: string | null;
};

export type StoreItem = { chain: string; code: string; name: string };

// Same rules as the item names read by a person: case, accents, punctuation,
// unit spellings («500γρ.» = «500 gr» = «500g», «1lt» = «1 L»), spacing.
// A unit word: not inside a longer word (Greek-aware — `\b` is ASCII-only and
// misses «320γρ»), but it may follow digits directly.
const unit = (alts: string) => new RegExp(`(?<!\\p{L})(?:${alts})(?![\\p{L}\\p{N}])`, 'gu');
const UNITS: [RegExp, string][] = [
  [unit('γρ|γραμ|gr|grs|g'), 'g'],
  [unit('κιλο|κιλα|kg|κg'), 'kg'],
  [unit('lt|ltr|λτ|λιτ|λιτρο|λιτρα|l'), 'l'],
  [unit('ml|μλ'), 'ml'],
  [unit('τεμ|τεμαχια|τεμαχιο|τμχ|pcs'), 'τεμ'],
];

export function normalizeItemName(s: string | null | undefined): string {
  let n = (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ς/g, 'σ')
    .replace(/(\d)[.,](\d)/g, '$1_$2')
    .replace(/[^\p{L}\p{N}_ ]+/gu, ' ');
  for (const [re, to] of UNITS) n = n.replace(re, to);
  return n
    .replace(/(\d)\s+(g|kg|l|ml|τεμ)(?![\p{L}\p{N}])/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Step 1: listing id → the store item code it is attached to. */
export function attachByName(listings: BarcodeListing[], items: StoreItem[]): Map<string, string> {
  const itemsByName = new Map<string, string[]>();
  for (const it of items) {
    const n = normalizeItemName(it.name);
    if (!n) continue;
    const k = `${it.chain}|${n}`;
    itemsByName.set(k, [...(itemsByName.get(k) ?? []), it.code]);
  }
  const barcodesByName = new Map<string, Set<string>>();
  for (const l of listings) {
    if (l.chainItemcode) continue;
    const k = `${l.chain}|${normalizeItemName(l.name)}`;
    if (!barcodesByName.has(k)) barcodesByName.set(k, new Set());
    barcodesByName.get(k)!.add(l.barcode);
  }
  const out = new Map<string, string>();
  for (const l of listings) {
    if (l.chainItemcode) continue;
    const n = normalizeItemName(l.name);
    if (!n) continue;
    const k = `${l.chain}|${n}`;
    const codes = [...new Set(itemsByName.get(k) ?? [])];
    if (codes.length !== 1) continue; // no item, or two items share the name
    if ((barcodesByName.get(k)?.size ?? 0) !== 1) continue; // the name carries two barcodes
    out.set(l.id, codes[0]);
  }
  return out;
}

// A barcode on more items of one store than this is treated as wrong data.
export const MAX_ITEMS_PER_BARCODE_PER_STORE = 3;

export type BarcodePair = { a: StoreItem; b: StoreItem; barcode: string };

/** Step 2: cross-store item pairs sharing a barcode (each pair once). */
export function barcodePairs(tagged: { item: StoreItem; barcode: string }[]): BarcodePair[] {
  const byBarcode = new Map<string, Map<string, StoreItem>>();
  for (const { item, barcode } of tagged) {
    if (!barcode) continue;
    if (!byBarcode.has(barcode)) byBarcode.set(barcode, new Map());
    byBarcode.get(barcode)!.set(`${item.chain}#${item.code}`, item);
  }
  const out: BarcodePair[] = [];
  const seen = new Set<string>();
  for (const [barcode, m] of byBarcode) {
    const items = [...m.values()];
    const perStore = new Map<string, number>();
    for (const it of items) perStore.set(it.chain, (perStore.get(it.chain) ?? 0) + 1);
    if ([...perStore.values()].some((n) => n > MAX_ITEMS_PER_BARCODE_PER_STORE)) continue;
    if (perStore.size < 2) continue;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const [a, b] = [items[i], items[j]];
        if (a.chain === b.chain) continue;
        const key = [`${a.chain}#${a.code}`, `${b.chain}#${b.code}`].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a, b, barcode });
      }
    }
  }
  return out;
}
