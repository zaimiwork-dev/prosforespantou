// Pack-size detection — guards against multipack offers being treated as, or
// compared against, single units. A My Market "Βεργίνα Μπίρα Κουτί 330ml
// (9+3 Δώρο)" (12 cans, 7.49€) must not be matched to / compared with a single
// "ΒΕΡΓΙΝΑ ΜΠΥΡΑ ΚΟΥΤΙ 330ML" — otherwise a 12-pack price reads as a single-can
// price and cross-chain comparison shows an absurd difference.
//
// Pure + strip-safe so the .mjs resolver and the .ts server actions both import
// it (no enums/namespaces/decorators).

/**
 * How many sellable units the name implies.
 *   "5+1 Δώρο"  -> 6   (multibuy bundle)
 *   "6x330ml"   -> 6   (also handles × and the Greek "*" multiplier)
 *   otherwise   -> 1
 *
 * Deliberately only counts multibuy (N+M) and multiply (N×M) patterns — these
 * are how multipacks are written and they appear in BOTH names when a pair is
 * genuinely the same pack. A bare "Nτεμ" (piece count) is intentionally NOT
 * used: the canonical Wolt name often omits it, which would false-flag matching
 * single-pack pairs as different.
 */
export function packCount(name: string | null | undefined): number {
  if (!name) return 1;
  const t = name.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/(\d+)\s*\+\s*(\d+)/))) return parseInt(m[1], 10) + parseInt(m[2], 10);
  if ((m = t.match(/(\d+)\s*[x×*]\s*\d+/))) return parseInt(m[1], 10);
  return 1;
}

/** True when two names carry the same pack size (so prices are comparable). */
export function samePack(a: string | null | undefined, b: string | null | undefined): boolean {
  return packCount(a) === packCount(b);
}
