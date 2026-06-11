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

// ===== Net quantity → €/κιλό, €/λίτρο, €/μεζούρα =====
// The shelf-label number Greek supermarkets print and shoppers actually
// compare. Exposes pack-size games: "2x500γρ στα 4€" vs "700γρ στα 3.2€" is
// invisible until both say €/κιλό.

export type UnitPrice = {
  per: 'κιλό' | 'λίτρο' | 'μεζούρα' | 'τεμ.';
  value: number; // €
};

// Weight ranges on diapers/clothing ("Νο4 (9-14kg)", "4-10 ετών 20-35kg") are
// NOT pack sizes — strip them before any size token can match.
const RANGE_RE = /\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?\s*(?:kg|κιλ|gr|g|γρ)/g;
// "12x500ml", "2*500γρ" — total = count × size.
const MULTI_SIZE_RE = /(\d{1,3})\s*[x*×χ]\s*(\d+(?:[.,]\d+)?)\s*(ml|lt|l(?=[^a-zα-ω]|$)|gr|g(?=[^a-zα-ω]|$)|γρ|kg|κιλ)/;
// Lone size: "250γρ.", "1,5lt", "900ml", "1kg" (decimal commas welcome).
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(ml|lt|l(?=[^a-zα-ω]|$)|gr|g(?=[^a-zα-ω]|$)|γρ|kg|κιλ)(?=[^a-zα-ω]|$)/;
// Laundry doses: "70ΜΕΖ", "24 μεζούρες", "50 πλύσεις" — for detergents the
// per-wash price beats per-liter (concentrates vs diluted).
const DOSES_RE = /(\d{1,3})\s*(?:μεζ|mez|πλυσ)/;
// "τιμή κιλού" / "το κιλό" — the listed price IS already per kilo.
const PER_KILO_RE = /(?:τιμη\s+κιλου|το\s+κιλο|ανα\s+κιλο|\/\s*κιλο)/;

const num = (s: string) => parseFloat(s.replace(',', '.'));
const toBase = (value: number, unit: string): { qty: number; per: 'κιλό' | 'λίτρο' } => {
  if (unit === 'kg' || unit.startsWith('κιλ')) return { qty: value * 1000, per: 'κιλό' };
  if (unit === 'lt' || unit === 'l') return { qty: value * 1000, per: 'λίτρο' };
  if (unit === 'ml') return { qty: value, per: 'λίτρο' };
  return { qty: value, per: 'κιλό' }; // gr/g/γρ
};

export function unitPrice(name: string | null | undefined, price: number | null | undefined): UnitPrice | null {
  if (!name || !price || !Number.isFinite(price) || price <= 0) return null;
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(RANGE_RE, ' ');

  // Sold by the kilo (deli counters): the price already answers the question.
  if (PER_KILO_RE.test(n)) return { per: 'κιλό', value: round2(price) };

  // Detergent doses win over volume.
  const doses = n.match(DOSES_RE);
  if (doses) {
    const d = parseInt(doses[1], 10);
    if (d >= 2 && d <= 200) return { per: 'μεζούρα', value: round2(price / d) };
  }

  // Net weight/volume: count×size, multiplied again by a gift multibuy when
  // the size describes ONE piece ("(9+3 Δώρο) 500ml" = 12×500ml).
  const multi = n.match(MULTI_SIZE_RE);
  let qty: number | null = null;
  let per: 'κιλό' | 'λίτρο' | null = null;
  if (multi) {
    const count = parseInt(multi[1], 10);
    const base = toBase(num(multi[2]), multi[3]);
    if (count >= 1 && count <= 99) { qty = count * base.qty; per = base.per; }
  } else {
    const size = n.match(SIZE_RE);
    if (size) {
      const base = toBase(num(size[1]), size[2]);
      qty = base.qty; per = base.per;
      const pack = parsePack(name);
      if (pack && pack.via === 'gift') qty *= pack.units;
    }
  }
  if (qty && per && qty >= 20 && qty <= 50_000) {
    const value = (price / qty) * 1000;
    if (value >= 0.05 && value <= 1000) return { per, value: round2(value) };
  }

  // Last resort: piece count alone (diapers, cups) → €/τεμ.
  const pack = parsePack(name);
  if (pack) return { per: 'τεμ.', value: round2(price / pack.units) };

  return null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
