// Coarse "same product family" key for showcase rails.
//
// The homepage top rail is 20 slots; three Έλμα gums and three Coca-Cola
// packs in it read as a broken feed even when each row is individually a
// fine deal. dedupeDeals collapses identical items; this collapses
// near-siblings (same brand-ish prefix) so a rail shows breadth. It is
// deliberately crude — a prefix, not a brand model — because it is only used
// to CAP repeats in a small showcase, never to hide anything from lists.
//
// Pure + strip-safe (no enums) so .mjs scripts could import it.

// Family = the brand-ish FIRST word («Έλμα», «Coca», «Dixan», «ΔΕΛΤΑ»).
// A showcase shows one item per brand; the rest are one tap away. When the
// first word is too short to be a brand («My Soft», «My Home», «The Chef's
// Way»), the first two words form the key.
export function familyKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const words = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/[-–_/]/g, ' ') // «COCA-COLA» and «COCA COLA» are one family
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9α-ω]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return null;
  // «My», «The», «Το» are not brands; a 4+ letter first word usually is.
  const key = words[0].length >= 4 ? words[0] : words.slice(0, 2).join(' ');
  return key.length >= 3 ? key : null;
}

// Keep at most `cap` rows per family, preserving order (lists arrive ranked).
export function capPerFamily<T extends { productName?: string | null }>(deals: T[], cap = 1): T[] {
  const seen = new Map<string, number>();
  const out: T[] = [];
  for (const d of deals) {
    const key = familyKey(d.productName);
    if (key) {
      const n = seen.get(key) || 0;
      if (n >= cap) continue;
      seen.set(key, n + 1);
    }
    out.push(d);
  }
  return out;
}

// Space out same-family rows in a long list WITHOUT dropping any (2026-09-16).
// /deals renders every loaded row, so capping would hide offers; instead a
// row whose family already appears among the last `gap` placed rows waits in
// a queue and is placed as soon as its family is clear again. Rows that never
// clear (a list ending in five Misko pastas) are appended in their original
// order. Rows without a family key are never held back.
export function spreadFamilies<T extends { productName?: string | null }>(deals: T[], gap = 3): T[] {
  if (!Array.isArray(deals) || deals.length < 3 || gap < 1) return deals;
  const out: T[] = [];
  const outKeys: (string | null)[] = [];
  const waiting: { d: T; key: string }[] = [];
  const clear = (key: string) => {
    for (let i = Math.max(0, outKeys.length - gap); i < outKeys.length; i++) {
      if (outKeys[i] === key) return false;
    }
    return true;
  };
  const place = (d: T, key: string | null) => { out.push(d); outKeys.push(key); };
  const drainWaiting = () => {
    let placed = true;
    while (placed) {
      placed = false;
      for (let i = 0; i < waiting.length; i++) {
        if (clear(waiting[i].key)) {
          const [w] = waiting.splice(i, 1);
          place(w.d, w.key);
          placed = true;
          break;
        }
      }
    }
  };
  for (const d of deals) {
    drainWaiting();
    const key = familyKey(d.productName);
    if (key && !clear(key)) { waiting.push({ d, key }); continue; }
    place(d, key);
  }
  drainWaiting();
  for (const w of waiting) place(w.d, w.key);
  return out;
}
