// «Τα βασικά της εβδομάδας» — one card per household staple, showing the
// cheapest ACTIVE OFFER for it today, compared per kilo / litre / piece.
//
// Why a curated list and not hotScore: a shopper of 60+ opens the app to learn
// where milk, oil and detergent are cheapest this week, not to browse gum. The
// rail answers that question in one glance.
//
// Why precise rules and not the KVI keyword list in hotness.ts: ranking can
// tolerate a false positive, a «φθηνότερο» claim cannot. Measured on the live
// set (2026-09-15): bare "γαλα" catches soap «Μέλι & Γάλα», "cola" catches
// chocolate ice cream, "φετα" catches frozen pies, "μπυρα" catches alcohol-free.
// Each staple is therefore department-scoped with explicit exclusions, and is
// compared on ONE unit so sizes are fair (a 4 lt tin vs a 1 lt bottle).
//
// Diapers are compared inside one size (Νο4): per-piece prices across sizes
// always crown newborn packs, which is true and useless.
//
// Pure + strip-safe (no enums) so scripts and tests import it directly.

import { unitPrice, type UnitPrice } from './pack-info.ts';

export type EssentialDef = {
  id: string;
  label: string;
  departments: string[];
  include: RegExp[];
  exclude?: RegExp;
  per: UnitPrice['per'];
};

// JS \b is ASCII-only; Greek tokens need explicit non-letter boundaries.
const L = 'a-zα-ως';
const start = (t: string) => new RegExp(`(?:^|[^${L}])${t}`);
const whole = (t: string) => new RegExp(`(?:^|[^${L}])${t}(?:[^${L}]|$)`);

export function normalizeName(s: string | null | undefined): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const DAIRY = 'Γαλακτοκομικά & Είδη Ψυγείου';
const CHEESE = 'Τυριά & Αλλαντικά';
const PANTRY = 'Είδη Παντοπωλείου';
const BREAKFAST = 'Πρωινό & Ροφήματα';
const DRINKS = 'Κάβα';
const CLEANING = 'Είδη Καθαρισμού & Σπιτιού';
const BABY = 'Βρεφικά Είδη';

export const ESSENTIALS: EssentialDef[] = [
  {
    id: 'milk',
    label: 'Γάλα',
    departments: [DAIRY],
    include: [start('γαλα(?!κτ)')],
    exclude: /σοκολατ|κακαο|καφε|εβαπορε|συμπ|βρεφ|σκονη|ροφημα|βανιλ|μπαναν|φραουλ|γιαουρτ|κρεμα|ρυζογαλ|protein|πρωτειν|βρωμη|αμυγδαλ|σογια|καρυδ|milko|μεγαλωνω|junior|kid/,
    per: 'λίτρο',
  },
  {
    id: 'coffee',
    label: 'Ελληνικός καφές',
    departments: [BREAKFAST],
    include: [/ελληνικ(?:ος|ου)?\s+καφε|καφε(?:ς|σ)?\s+(?:[^\s]+\s+){0,2}ελληνικ/],
    exclude: /καψουλ|capsul|ροφημα|γλυκ|μπρικ|φλιτζαν/,
    per: 'κιλό',
  },
  {
    id: 'olive-oil',
    label: 'Ελαιόλαδο',
    departments: [PANTRY],
    include: [start('ελαιολαδ')],
    exclude: /(?:σε|με|και|&)\s+(?:εξαιρετικο\s+)?(?:παρθενο\s+)?ελαιολαδ|τονο|σαρδελ|σαλατ|πατατ|chips|ντοματ|μανιταρ|κριτσιν|παξιμ|ελιες|λαχανικ|πιπερ|σπρει|spray/,
    per: 'λίτρο',
  },
  {
    id: 'feta',
    label: 'Φέτα',
    departments: [CHEESE, DAIRY],
    include: [whole('φετα')],
    exclude: /(?:με|και|&|,)\s+(?:τυρι\s+)?(?:[^\s]+\s+)?φετα|αλειφωτ|στριφταρ|σαλτσ|τορτελ|πιπερ|πιτα|σπανακ|ρολιν|τριγων|κιχ|πιροσκ|σφολιατ|κασσιατ|μυζηθρ|κρεμα|πατε/,
    per: 'κιλό',
  },
  {
    id: 'laundry',
    label: 'Απορρυπαντικό ρούχων',
    departments: [CLEANING],
    include: [/ρουχων/],
    // Softeners share «μεζ» and «ρούχων»; some chains type the Μ as a Latin M.
    exclude: /[mμ]αλακτ|πιατ|λεκε|χλωρ|λευκαντ|χεριου|ταμπλετ|αρωμα\s+ρουχ|κρεμαστρ|απλωστρ|καλαθ/,
    per: 'μεζούρα',
  },
  {
    id: 'toilet-paper',
    label: 'Χαρτί υγείας',
    departments: [CLEANING],
    include: [/χαρτ(?:ι|ια)\s+υγειας/],
    exclude: /υγρ|βρεγμ|θηκη/,
    per: 'κιλό',
  },
  {
    id: 'pasta',
    label: 'Ζυμαρικά',
    departments: [PANTRY],
    include: [/μακαρονι|σπαγγετ|spaghetti|πεννε|penne|κριθαρακ|ζυμαρικ|χυλοπιτ|ταλιατελ|fusilli|βιδες|κοφτο/],
    exclude: /σαλτσ|sauce|ετοιμ|σαλατ|γεμιστ|τορτελ|ravioli|νουντλ|noodl|protein|πρωτειν|χωρις γλουτ|gluten/,
    per: 'κιλό',
  },
  {
    id: 'cola',
    label: 'Αναψυκτικό κόλα',
    departments: [DRINKS],
    include: [/coca|pepsi|(?:^|[^a-z])cola(?![a-z])|(?:^|[^α-ω])κολα(?:[^α-ω]|$)/],
    exclude: /ρουμ|ουισκ|βοτκ|τζιν|jack|energy|καραμελ/,
    per: 'λίτρο',
  },
  {
    id: 'beer',
    label: 'Μπύρα',
    departments: [DRINKS],
    include: [start('μπ(?:υ|ι)ρα'), /beer|lager|pils/],
    exclude: /ανευ|χωρις\s+αλκοολ|alcohol\s*free|0[.,]0|ra?r?dler|ποτηρ|ανοιχτηρ|ψυγει|πρετσελ/,
    per: 'λίτρο',
  },
  {
    id: 'diapers',
    label: 'Πάνες Νο4',
    departments: [BABY],
    include: [/πανε|pampers|babylino|huggies/],
    // Size 4 only (see DIAPER_SIZE_4); swim pants and adult pads are out.
    exclude: /μωρομαντ|wipes|κρεμα|ακρατει|ενηλικ|swim|μαγιο/,
    per: 'τεμ.',
  },
];

// Size gate for diapers: «Νο4», «No 4», «N.4», «Maxi» — but not «4-9kg».
const DIAPER_SIZE_4 = /(?:^|[^a-zα-ω])(?:no|νο|n|ν)\s*\.?\s*4(?![0-9\-–.,])|(?:^|[^a-z])maxi(?![a-z])/;

export function matchesEssential(def: EssentialDef, name: string | null | undefined, category: string | null | undefined): boolean {
  if (!category || !def.departments.includes(category)) return false;
  const n = normalizeName(name);
  if (!def.include.some((re) => re.test(n))) return false;
  if (def.exclude && def.exclude.test(n)) return false;
  if (def.id === 'diapers' && !DIAPER_SIZE_4.test(n)) return false;
  return true;
}

export type EssentialRow = {
  id: string;
  productName: string;
  category: string;
  discountedPrice: number;
  supermarket: string | null;
};

export type EssentialPick<T> = {
  id: string;
  label: string;
  deal: T;
  unit: UnitPrice;
  // Distinct chains with a comparable offer for this staple today.
  chainCount: number;
};

// A «cheapest» claim needs something to be cheaper than.
export const MIN_CHAINS = 2;

export function pickEssentials<T extends EssentialRow>(rows: T[], defs: EssentialDef[] = ESSENTIALS): EssentialPick<T>[] {
  const out: EssentialPick<T>[] = [];
  for (const def of defs) {
    const priced: { row: T; unit: UnitPrice }[] = [];
    for (const row of rows) {
      if (!row.supermarket || !matchesEssential(def, row.productName, row.category)) continue;
      const unit = unitPrice(row.productName, row.discountedPrice);
      if (!unit || unit.per !== def.per) continue;
      priced.push({ row, unit });
    }
    const chains = new Set(priced.map((p) => p.row.supermarket));
    if (chains.size < MIN_CHAINS) continue;
    priced.sort((a, b) =>
      a.unit.value - b.unit.value
      || a.row.discountedPrice - b.row.discountedPrice
      || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
    const best = priced[0];
    out.push({ id: def.id, label: def.label, deal: best.row, unit: best.unit, chainCount: chains.size });
  }
  return out;
}
