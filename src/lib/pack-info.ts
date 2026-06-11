// Parse the pack / multibuy quantity out of a chain's offer name, so the UI
// can be honest about what the shelf price actually buys. Chains photograph a
// single can but price the bundle — "Βεργίνα Μπίρα Κουτί 330ml (9+3 Δώρο)" at
// 8.42€ is twelve cans, and 0.70€/τεμ is the number a shopper compares.
//
// Conservative by design: returns null unless a confident pattern matches.
// Pure + strip-safe (no enums) so .mjs scripts can import it if ever needed.

export type PackInfo = {
  units: number;          // total pieces the price buys
  via: 'gift' | 'multipack' | 'count';
};

// NOTE: \b is ASCII-only in JS and never fires next to Greek letters — Greek
// tokens end with an explicit (?=[^α-ωa-z]|$) lookahead instead. Input is
// already lowercased + accent-stripped when these run.
const GIFT_RE = /\(?\s*(\d{1,2})\s*\+\s*(\d{1,2})\s*\)?\s*δ(?:ωρο)?(?=[^α-ωa-z]|$)/;
const MULTIPACK_RE = /(\d{1,3})\s*[x*×χ]\s*\d+(?:[.,]\d+)?\s*(?:ml|lt|l\b|gr|g\b|γρ|kg|κιλ|mez|μεζ|τεμ|φακελ)/;
const COUNT_RE = /(\d{1,3})\s*(?:τεμαχια|τεμ\.|τεμ(?=[^α-ωa-z]|$)|τμχ|ρολ(?:α|οι)?(?=[^α-ωa-z]|$)|pcs)/;

export function parsePack(name: string | null | undefined): PackInfo | null {
  if (!name) return null;
  // Accent-strip so δώρο/δωρο, τεμάχια/τεμαχια match uniformly.
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // "9+3 Δώρο", "(5+1)Δ", "330ML(5+1)ΔΩΡΟ" — the promo wording is the most
  // explicit statement of what you take home, so it wins over pack-size text.
  const gift = n.match(GIFT_RE);
  if (gift) {
    const units = parseInt(gift[1], 10) + parseInt(gift[2], 10);
    if (units >= 2 && units <= 99) return { units, via: 'gift' };
  }

  // "6x330ml", "3*250γρ", "20x2γρ" — first factor is the piece count.
  const multi = n.match(MULTIPACK_RE);
  if (multi) {
    const units = parseInt(multi[1], 10);
    if (units >= 2 && units <= 99) return { units, via: 'multipack' };
  }

  // "52τεμ.", "50 Τεμάχια", "12 ρολά"
  const count = n.match(COUNT_RE);
  if (count) {
    const units = parseInt(count[1], 10);
    if (units >= 2 && units <= 200) return { units, via: 'count' };
  }

  return null;
}

// "8.42€ for 12" → "0.70" (formatted per-unit price), null when senseless.
export function perUnitPrice(price: number | null | undefined, units: number): string | null {
  if (!price || !Number.isFinite(price) || units < 2) return null;
  const per = price / units;
  if (per <= 0) return null;
  return per.toFixed(2);
}
