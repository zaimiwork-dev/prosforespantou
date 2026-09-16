type AisleDeal = {
  category?: string | null;
  productName?: string | null;
  discountPercent?: number | null;
  discountedPrice?: number | null;
};

export type SupermarketAisle<T> = {
  key: string;
  label: string;
  // A CategoryIcon key, rendered as a stroke glyph by the aisle strip.
  icon: string;
  deals: T[];
};

const DEPARTMENT_ORDER = [
  'Φρούτα & Λαχανικά',
  'Κρέας & Ψάρι',
  'Γαλακτοκομικά & Είδη Ψυγείου',
  'Τυριά & Αλλαντικά',
  'Σαλάτες & Αλοιφές',
  'Αρτοποιία',
  'Κατεψυγμένα',
  'Κονσέρβες',
  'Είδη Παντοπωλείου',
  'breakfast',
  'coffee',
  'tea',
  'juice',
  'Σνακ & Γλυκά',
  'alcohol',
  'soft-drinks',
  'water',
  'drinks-other',
  'Προσωπική Φροντίδα',
  'Βρεφικά Είδη',
  'Είδη Καθαρισμού & Σπιτιού',
  'Είδη Κατοικιδίων',
  'Άλλο',
];

// `icon` is a CategoryIcon key (src/components/CategoryIcon.js), not an
// emoji: the aisle strip renders the same stroke glyphs as the rest of the
// UI. Sub-aisles with no department of their own borrow the nearest one.
const META: Record<string, { label: string; icon: string }> = {
  'Φρούτα & Λαχανικά': { label: 'Φρούτα & Λαχανικά', icon: 'Φρούτα & Λαχανικά' },
  'Κρέας & Ψάρι': { label: 'Κρέας & Ψάρι', icon: 'Κρέας & Ψάρι' },
  'Γαλακτοκομικά & Είδη Ψυγείου': { label: 'Γαλακτοκομικά & Ψυγείο', icon: 'Γαλακτοκομικά & Είδη Ψυγείου' },
  'Τυριά & Αλλαντικά': { label: 'Τυριά & Αλλαντικά', icon: 'Τυριά & Αλλαντικά' },
  'Σαλάτες & Αλοιφές': { label: 'Σαλάτες & Αλοιφές', icon: 'Σαλάτες & Αλοιφές' },
  'Αρτοποιία': { label: 'Αρτοποιία', icon: 'Αρτοποιία' },
  'Κατεψυγμένα': { label: 'Κατεψυγμένα', icon: 'Κατεψυγμένα' },
  'Κονσέρβες': { label: 'Κονσέρβες', icon: 'Κονσέρβες' },
  'Είδη Παντοπωλείου': { label: 'Είδη Παντοπωλείου', icon: 'Είδη Παντοπωλείου' },
  breakfast: { label: 'Πρωινό & Δημητριακά', icon: 'Αρτοποιία' },
  coffee: { label: 'Καφές', icon: 'Πρωινό & Ροφήματα' },
  tea: { label: 'Τσάι & Ροφήματα', icon: 'Πρωινό & Ροφήματα' },
  juice: { label: 'Χυμοί', icon: 'Πρωινό & Ροφήματα' },
  'Σνακ & Γλυκά': { label: 'Σνακ & Γλυκά', icon: 'Σνακ & Γλυκά' },
  alcohol: { label: 'Αλκοολούχα Ποτά', icon: 'Κάβα' },
  'soft-drinks': { label: 'Αναψυκτικά & Energy Drinks', icon: 'Κάβα' },
  water: { label: 'Νερά', icon: 'Κάβα' },
  'drinks-other': { label: 'Άλλα Ποτά', icon: 'Κάβα' },
  'Προσωπική Φροντίδα': { label: 'Προσωπική Φροντίδα', icon: 'Προσωπική Φροντίδα' },
  'Βρεφικά Είδη': { label: 'Βρεφικά Είδη', icon: 'Βρεφικά Είδη' },
  'Είδη Καθαρισμού & Σπιτιού': { label: 'Καθαρισμός & Σπίτι', icon: 'Είδη Καθαρισμού & Σπιτιού' },
  'Είδη Κατοικιδίων': { label: 'Είδη Κατοικιδίων', icon: 'Είδη Κατοικιδίων' },
  'Άλλο': { label: 'Άλλο', icon: 'Άλλο' },
};

const normalize = (value: string | null | undefined) =>
  (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function drinkAisle(name: string): string {
  if (/(μπυρ|μπιρ|κρασι|οινο|wine|ουζο|τσιπουρ|βοτκ|vodka|ουισκ|whisk|τζιν|gin\b|ρουμι|rum\b|λικερ|σαμπαν|prosecco|ρετσιν|μηλιτ|somersby)/.test(name)) {
    return 'alcohol';
  }
  if (/(νερο|water|εμφιαλωμεν|μεταλλικο|επιτραπεζιο)/.test(name)) return 'water';
  if (/(αναψυκ|cola|coca|pepsi|fanta|sprite|σοδα|soda|tonic|λεμοναδ|πορτοκαλαδ|γκαζοζ|energy drink|red bull|monster|powerade|schweppes)/.test(name)) {
    return 'soft-drinks';
  }
  return 'drinks-other';
}

function breakfastAisle(name: string): string {
  if (/(καφε|coffee|nescafe|espresso|nespresso|καπουτσιν|φραπε)/.test(name)) return 'coffee';
  if (/(χυμο|νεκταρ|φρουτοποτο)/.test(name)) return 'juice';
  if (/(τσαι|tea\b|κακαο|cacao|ροφημα)/.test(name)) return 'tea';
  return 'breakfast';
}

export function supermarketAisleKey(deal: AisleDeal): string {
  const category = deal.category || 'Άλλο';
  const name = normalize(deal.productName);
  if (category === 'Κάβα') return drinkAisle(name);
  if (category === 'Πρωινό & Ροφήματα') return breakfastAisle(name);
  return META[category] ? category : 'Άλλο';
}

export function groupSupermarketDealsByAisle<T extends AisleDeal>(deals: T[]): SupermarketAisle<T>[] {
  const groups = new Map<string, T[]>();
  for (const deal of deals) {
    const key = supermarketAisleKey(deal);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(deal);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = DEPARTMENT_ORDER.indexOf(a);
      const bi = DEPARTMENT_ORDER.indexOf(b);
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai)
        - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
    })
    .map(([key, aisleDeals]) => ({
      key,
      label: META[key]?.label || key,
      icon: META[key]?.icon || 'Άλλο',
      // Graspable order inside each aisle: biggest provable discount first,
      // cheapest first among equals — the incoming hotScore order carries
      // ranking jitter that reads as random on a shelf.
      deals: [...aisleDeals].sort((a, b) =>
        ((b.discountPercent ?? 0) - (a.discountPercent ?? 0))
        || ((a.discountedPrice ?? 0) - (b.discountedPrice ?? 0))),
    }));
}
