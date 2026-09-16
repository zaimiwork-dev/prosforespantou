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
  // The first number must not be glued to a word ("SPF50+ 40ml" is a sun
  // factor, not a 50+40 multibuy) — found auditing mappings 2026-06-12.
  if ((m = t.match(/(?<![a-zα-ωά-ώ0-9])(\d+)\s*\+\s*(\d+)/))) return parseInt(m[1], 10) + parseInt(m[2], 10);
  if ((m = t.match(/(?<![a-zα-ωά-ώ0-9])(\d+)\s*[x×*]\s*\d+/))) return parseInt(m[1], 10);
  return 1;
}

// Pieces a name STATES outright: «30τεμ.», «12 ρολά», «4x12τεμ» (= 48).
// null when the name says nothing, which is the common case — one chain
// omitting the count must never look like a different pack.
//
// This is the piece count packCount() deliberately refuses to use for
// matching (see above). It is safe HERE because it only ever fires when both
// sides state a count: 2026-09-16 found Fairy Platinum 19τεμ and 30τεμ under
// one Product, priced 8.99€ and 17.98€, rendering as each other's rival.
// (pack-info.ts parses the same tokens for the €/τεμ. line; this stays
// self-contained so .mjs scripts can import packaging.ts on its own.)
const PIECES_MULTI_RE = /(\d{1,3})\s*[x*×χ]\s*(\d{1,3})\s*(?:τεμαχια|τεμ\.?|τμχ|ρολα|ρολοι|ρολ\.?|pcs)(?![α-ωa-z])/;
const PIECES_RE = /(\d{1,3})\s*(?:τεμαχια|τεμ\.?|τμχ|ρολα|ρολοι|ρολ\.?|pcs)(?![α-ωa-z])/;

export function statedPieces(name: string | null | undefined): number | null {
  if (!name) return null;
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const multi = n.match(PIECES_MULTI_RE);
  if (multi) {
    const total = parseInt(multi[1], 10) * parseInt(multi[2], 10);
    if (total >= 2 && total <= 500) return total;
  }
  const one = n.match(PIECES_RE);
  if (one) {
    const total = parseInt(one[1], 10);
    if (total >= 2 && total <= 500) return total;
  }
  return null;
}

/** True when two names carry the same pack size (so prices are comparable). */
export function samePack(a: string | null | undefined, b: string | null | undefined): boolean {
  if (packCount(a) !== packCount(b)) return false;
  const pa = statedPieces(a);
  const pb = statedPieces(b);
  if (pa !== null && pb !== null && pa !== pb) return false;
  return true;
}
