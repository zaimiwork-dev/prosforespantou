import { describe, it, expect } from 'vitest';
import {
  salientTokens,
  nameSimilarity,
  filterComparable,
  variantConflict,
  COMPARISON_SIMILARITY_FLOOR,
} from './offer-similarity';

describe('variantConflict (flavour/fat/type guard)', () => {
  it('blocks different flavours that otherwise score high', () => {
    expect(variantConflict('LIPTON ICE TEA GREEN LEMON 500ML', 'Lipton Ice Tea Green Φράουλα 500ml')).toBe(true);
    expect(variantConflict('Παπαδοπούλου Μπισκότα Σοκολάτα 200g', 'Παπαδοπούλου Μπισκότα Λεμόνι 200g')).toBe(true);
  });
  it('blocks fat / sugar / type differences', () => {
    expect(variantConflict('Adoro Τυρί Κρέμα Light 200gr', 'ADORO ΤΥΡΙ ΚΡΕΜΑ 200ΓΡ')).toBe(true);
    expect(variantConflict('Γάλα ΝΟΥΝΟΥ Πλήρες 1L', 'Γάλα ΝΟΥΝΟΥ Ελαφρύ 1L')).toBe(true);
    expect(variantConflict('FANTA Πορτοκαλάδα 6x330ml', 'Fanta Πορτοκαλάδα Zero 6x330ml')).toBe(true);
  });
  it('treats latin/greek spellings of the same flavour as equal', () => {
    expect(variantConflict('FAIRY LEMON 660ML', 'Fairy Λεμόνι 660ml')).toBe(false);
    expect(variantConflict('Coca Cola Zero 330ml', 'Coca-Cola Zero 330ml')).toBe(false);
  });
  it('does not block on the generic word "Χωρίς" or wine colour', () => {
    expect(variantConflict('Brava Μουστάρδα Απαλή 430gr', 'BRAVA Μουστάρδα Απαλή Χωρίς γλουτένη 430g')).toBe(false);
    expect(variantConflict('MARTINI Prosecco 750ml', 'MARTINI Prosecco Αφρώδης Λευκός Οίνος 750ml')).toBe(false);
  });
});

// Real names from the 2026-06-12 user report: an AB "Στιγμιαίος Καφές Rich
// Caramel 95g" offer rendered NESCAFE Gold and NESCAFE Organic (different
// products, same mis-mapped productId, same 95g pack) in ΣΥΓΚΡΙΣΗ ΤΙΜΗΣ.
const AB_RICH_CARAMEL = 'Στιγμιαίος Καφές Rich Caramel 95g';
const SKL_RICH_CARAMEL = 'NESCAFE Rich Caramel Καφές Στιγμιαίος 95γρ';
const SKL_GOLD = 'NESCAFE Gold Καφές Στιγμιαίος 95g';
const SKL_ORGANIC = 'NESCAFE Organic Καφές Στιγμιαίος Βιολογικός 95g';

describe('salientTokens', () => {
  it('strips accents, final sigma, short noise words', () => {
    const t = salientTokens('Καφές με Γάλα σε κουτί');
    expect(t.has('καφεσ')).toBe(true);
    expect(t.has('γαλα')).toBe(true);
    expect(t.has('με')).toBe(false);
    expect(t.has('σε')).toBe(false);
  });

  it('canonicalizes size units across spellings', () => {
    expect(salientTokens('Φέτα 280γρ').has('280g')).toBe(true);
    expect(salientTokens('Feta 280gr').has('280g')).toBe(true);
    expect(salientTokens('Νερό 1lt').has('1l')).toBe(true);
  });

  it('splits multiplier packs so 2*1L and 2x1lt agree', () => {
    const a = salientTokens('COCA COLA ZERO 2*1L');
    const b = salientTokens('Coca-Cola Zero 2x1lt');
    expect(a.has('1l')).toBe(true);
    expect(b.has('1l')).toBe(true);
  });

  it('transliterates Latin brand tokens to Greek', () => {
    expect(salientTokens('NESCAFE Classic').has('νεσκαφε')).toBe(true);
    expect(salientTokens('ΝΕΣΚΑΦΕ Κλασικός').has('νεσκαφε')).toBe(true);
    expect(salientTokens('VERGINA Weiss').has('βεργινα')).toBe(true);
  });
});

describe('nameSimilarity', () => {
  it('same product, different chain naming → above floor', () => {
    expect(nameSimilarity(AB_RICH_CARAMEL, SKL_RICH_CARAMEL))
      .toBeGreaterThanOrEqual(COMPARISON_SIMILARITY_FLOOR);
    expect(nameSimilarity('COCA COLA ZERO 2*1L', 'Coca-Cola Zero 2x1lt'))
      .toBeGreaterThanOrEqual(COMPARISON_SIMILARITY_FLOOR);
    expect(nameSimilarity('Φέτα ΗΠΕΙΡΟΣ 400γρ', 'ΗΠΕΙΡΟΣ Φέτα ΠΟΠ 400g'))
      .toBeGreaterThanOrEqual(COMPARISON_SIMILARITY_FLOOR);
  });

  it('different variants of the same brand → below floor', () => {
    expect(nameSimilarity(AB_RICH_CARAMEL, SKL_GOLD))
      .toBeLessThan(COMPARISON_SIMILARITY_FLOOR);
    expect(nameSimilarity(AB_RICH_CARAMEL, SKL_ORGANIC))
      .toBeLessThan(COMPARISON_SIMILARITY_FLOOR);
  });

  it('survives abbreviations, Greek inflection, unit spellings (audit false-positives)', () => {
    // Found while auditing real mappings: these are the SAME product and must
    // not be flagged as mismatches.
    expect(nameSimilarity(
      'Υφαντής Φιλέτο Γαλοπούλας Καπνιστό & Milner 280gr',
      'ΥΦΑΝΤΗΣ ΦΙΛ. ΓΑΛΟΠ. ΚΑΠ. & MILNER 280ΓΡ'
    )).toBeGreaterThanOrEqual(COMPARISON_SIMILARITY_FLOOR);
    expect(nameSimilarity(
      'Pantene Αφρός Πλούσιος Όγκος 200ml',
      'Pantene Pro-V Αφρός Για Πλούσιο Όγκο 200ml.'
    )).toBeGreaterThanOrEqual(COMPARISON_SIMILARITY_FLOOR);
    expect(nameSimilarity(
      'Fabuloso Θαλασσινή Φρεσκάδα Καθαριστικό Πατώματος 1000ml',
      'Fabuloso Υγρό Καθαριστικό Θαλασσινή Φρεσκάδα 1lt.'
    )).toBeGreaterThanOrEqual(COMPARISON_SIMILARITY_FLOOR);
  });

  it('number tokens never prefix-match ("2" vs "250ml")', () => {
    const a = salientTokens('Χυμός 2x1lt');
    expect(a.has('2')).toBe(true);
    expect(nameSimilarity('Σαμπουάν 250ml', 'Χυμός 2x1lt')).toBe(0);
  });

  it('unrelated products → near zero', () => {
    expect(nameSimilarity('Pampers Premium Care Πάνες No4', 'DIXAN Απορρυπαντικό ρούχων'))
      .toBeLessThan(0.1);
  });

  it('empty / missing names never pass', () => {
    expect(nameSimilarity(null, SKL_GOLD)).toBe(0);
    expect(nameSimilarity(AB_RICH_CARAMEL, '')).toBe(0);
  });
});

describe('filterComparable', () => {
  const mk = (name: string, chain: string, id: string) => ({ name, chain, id });
  const getName = (c: { name: string }) => c.name;
  const getChain = (c: { chain: string }) => c.chain;

  it('keeps the right product and drops mis-mapped siblings (user-reported case)', () => {
    const candidates = [
      mk(SKL_RICH_CARAMEL, 'sklavenitis', 'right'),
      mk(SKL_GOLD, 'sklavenitis', 'wrong-gold'),
      mk(SKL_ORGANIC, 'sklavenitis', 'wrong-organic'),
    ];
    const kept = filterComparable(AB_RICH_CARAMEL, candidates, getName, getChain);
    expect(kept.map((c) => c.id)).toEqual(['right']);
  });

  it('drops a lone mis-mapped candidate even without a better sibling', () => {
    const kept = filterComparable(
      AB_RICH_CARAMEL,
      [mk(SKL_GOLD, 'sklavenitis', 'wrong-gold')],
      getName,
      getChain
    );
    expect(kept).toEqual([]);
  });

  it('keeps identically-named web+leaflet rows of one chain', () => {
    const candidates = [
      mk(SKL_RICH_CARAMEL, 'sklavenitis', 'web-row'),
      mk(SKL_RICH_CARAMEL, 'sklavenitis', 'leaflet-row'),
    ];
    const kept = filterComparable(AB_RICH_CARAMEL, candidates, getName, getChain);
    expect(kept.map((c) => c.id).sort()).toEqual(['leaflet-row', 'web-row']);
  });

  it('judges each chain independently', () => {
    const candidates = [
      mk(SKL_RICH_CARAMEL, 'sklavenitis', 'skl-right'),
      mk(SKL_GOLD, 'masoutis', 'mas-wrong'),
    ];
    const kept = filterComparable(AB_RICH_CARAMEL, candidates, getName, getChain);
    expect(kept.map((c) => c.id)).toEqual(['skl-right']);
  });
});
