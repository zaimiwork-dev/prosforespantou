import { describe, it, expect } from 'vitest';
import { ESSENTIALS, matchesEssential, pickEssentials, MIN_CHAINS } from './weekly-essentials';

const def = (id: string) => {
  const d = ESSENTIALS.find((e) => e.id === id);
  if (!d) throw new Error(`no essential ${id}`);
  return d;
};

// Every name below is a real active offer from 2026-09-15.
describe('matchesEssential — the false positives measured on the live set stay out', () => {
  it('milk: real milk in, soap / chocolate / condensed / plant drinks out', () => {
    const milk = def('milk');
    const DAIRY = 'Γαλακτοκομικά & Είδη Ψυγείου';
    expect(matchesEssential(milk, 'GMUNDNER MILCH Γάλα Υψηλής Παστερίωσης Ελαφρύ 1lt', DAIRY)).toBe(true);
    expect(matchesEssential(milk, 'ΔΕΛΤΑ ΓΑΛΑ ΤΟΥ ΤΟΠΟΥ ΜΑΣ ΠΛΗΡΕΣ 1.5L', DAIRY)).toBe(true);
    expect(matchesEssential(milk, 'Palmolive Naturals Κρεμοσάπουνο Μέλι & Γάλα 300ml.', 'Προσωπική Φροντίδα')).toBe(false);
    expect(matchesEssential(milk, 'ΙΟΝ ΣΟΚΟΦΡΕΤΑ ΓΑΛΑΚΤΟΣ ΜΕ STEVIA 38ΓΡ', DAIRY)).toBe(false);
    expect(matchesEssential(milk, 'ΝΟΥΝΟΥ KID ΓΑΛΑ ΣΥΜΠ/ΝΟ 6*400ΓΡ', DAIRY)).toBe(false);
    expect(matchesEssential(milk, 'ΔΕΛΤΑ MILKO ΜΠΟΥΚΑΛΙ 450ML', DAIRY)).toBe(false);
  });

  it('feta: the cheese in, pies / sauces / spreads that contain feta out', () => {
    const feta = def('feta');
    const CHEESE = 'Τυριά & Αλλαντικά';
    expect(matchesEssential(feta, 'Φέτα ΔΩΔΩΝΗ ΠΟΠ σε Άλμη 1kg', CHEESE)).toBe(true);
    expect(matchesEssential(feta, 'Μασούτης Από Τον Τόπο Μας Τυρί Φέτα ΠΟΠ 900γρ.', CHEESE)).toBe(true);
    expect(matchesEssential(feta, 'Χρυσή Ζύμη Στριφτάρι Μακεδονίτικο Με Τυρί Μυζήθρα & Φέτα ΠΟΠ 800γρ.', CHEESE)).toBe(false);
    expect(matchesEssential(feta, 'Κύκνος Έτοιμη Σάλτσα Τομάτας Με Φέτα & Ρίγανη 350γρ.', CHEESE)).toBe(false);
    expect(matchesEssential(feta, 'Ήπειρος Αλειφωτή Με Φέτα 200gr', CHEESE)).toBe(false);
    expect(matchesEssential(feta, 'Melissa Τορτελίνι Με Φέτα 250γρ.', CHEESE)).toBe(false);
  });

  it('laundry: detergent in, softener out (including a Latin-M «Mαλακτικό»)', () => {
    const laundry = def('laundry');
    const CLEAN = 'Είδη Καθαρισμού & Σπιτιού';
    expect(matchesEssential(laundry, 'Skip Υγρό Απορρυπαντικό Πλυντηρίου Ρούχων Spring Fresh 100mez. 4,5lt.', CLEAN)).toBe(true);
    expect(matchesEssential(laundry, 'Lenor Mαλακτικό Ρούχων Ανοιξιάτικη Aύρα 59μεζ 1,20lt', CLEAN)).toBe(false);
    expect(matchesEssential(laundry, 'Softex Μαλακτικό Ρούχων 60μεζ', CLEAN)).toBe(false);
  });

  it('cola and beer: chocolate, alcohol-free and radler stay out', () => {
    const DRINKS = 'Κάβα';
    expect(matchesEssential(def('cola'), 'ΕΠΙΛΟΓΗ ΜΟΥ COLA 1.5L', DRINKS)).toBe(true);
    expect(matchesEssential(def('cola'), 'Nirvana Παγωτό Chocolate & Choco Chips 322γρ./420ml.', 'Κατεψυγμένα')).toBe(false);
    expect(matchesEssential(def('beer'), 'ΒΕΡΓΙΝΑ Μπίρα Lager 4x500ml', DRINKS)).toBe(true);
    expect(matchesEssential(def('beer'), 'Fix Άνευ Μπίρα Κουτί 330ml 5+1Δώρο', DRINKS)).toBe(false);
    expect(matchesEssential(def('beer'), 'Βεργίνα Rardler Μπίρα 330ml. 3+1Δώρο', DRINKS)).toBe(false);
  });

  it('diapers: size 4 only; «4-9kg» on a size 3 pack is not size 4', () => {
    const diapers = def('diapers');
    const BABY = 'Βρεφικά Είδη';
    expect(matchesEssential(diapers, "SEPTONA Calm n' Care Πάνες Maxi Nο4 8-13Kg 52τεμ", BABY)).toBe(true);
    expect(matchesEssential(diapers, 'Babylino Sensitive Πάνες No4 (8-13kg.) Economy  50τεμ.', BABY)).toBe(true);
    expect(matchesEssential(diapers, "SEPTONA Calm n' Care Πάνες Midi Nο3 4-9Kg 60τεμ", BABY)).toBe(false);
    expect(matchesEssential(diapers, 'BABYLINO Sensitive Πάνες Cotton Soft Νo1 Newborn 2-5kg 68τεμ', BABY)).toBe(false);
    expect(matchesEssential(diapers, 'Babylino Πάνες Sensitive Swim Pants No4-5 9-15kg 14τεμ', BABY)).toBe(false);
  });

  it('the department gate applies to every staple', () => {
    expect(matchesEssential(def('olive-oil'), 'ΑΝΘΕΛΑ Ελαιόλαδο 4lt', 'Είδη Παντοπωλείου')).toBe(true);
    expect(matchesEssential(def('olive-oil'), 'Septona Βρεφικό Λάδι Βάλσαμο & Ελαιόλαδο 200ml', 'Προσωπική Φροντίδα')).toBe(false);
    expect(matchesEssential(def('olive-oil'), 'ΑΝΘΕΛΑ Ελαιόλαδο 4lt', null)).toBe(false);
  });
});

describe('pickEssentials', () => {
  const row = (id: string, supermarket: string, productName: string, discountedPrice: number, category = 'Γαλακτοκομικά & Είδη Ψυγείου') =>
    ({ id, supermarket, productName, discountedPrice, category });

  it('compares per unit, so a bigger pack can win on price per litre', () => {
    const picks = pickEssentials([
      row('a', 'lidl', 'Γάλα Πλήρες 1lt', 1.19),
      row('b', 'masoutis', 'Γάλα Πλήρες 1,5lt', 1.5), // 1.00 €/λίτρο
      row('c', 'ab', 'Γάλα Ελαφρύ 1lt', 1.09),
    ]);
    expect(picks).toHaveLength(1);
    expect(picks[0].id).toBe('milk');
    expect(picks[0].deal.id).toBe('b');
    expect(picks[0].unit).toEqual({ per: 'λίτρο', value: 1 });
    expect(picks[0].chainCount).toBe(3);
  });

  it(`skips a staple offered by fewer than ${MIN_CHAINS} chains — no «cheapest» claim without a rival`, () => {
    const picks = pickEssentials([
      row('a', 'lidl', 'Γάλα Πλήρες 1lt', 1.19),
      row('b', 'lidl', 'Γάλα Ελαφρύ 1lt', 1.09),
    ]);
    expect(picks).toEqual([]);
  });

  it('ignores rows whose unit cannot be read, and rows with no chain', () => {
    const picks = pickEssentials([
      row('a', 'lidl', 'Γάλα Πλήρες', 0.2), // no size → not comparable
      row('b', 'ab', 'Γάλα Πλήρες 1lt', 1.19),
      { ...row('c', 'x', 'Γάλα Πλήρες 1lt', 0.5), supermarket: null },
      row('d', 'masoutis', 'Γάλα Πλήρες 1lt', 1.29),
    ]);
    expect(picks[0].deal.id).toBe('b');
    expect(picks[0].chainCount).toBe(2);
  });

  it('breaks unit-price ties by shelf price, then id, so the pick is stable', () => {
    const picks = pickEssentials([
      row('z', 'lidl', 'Γάλα Πλήρες 2lt', 2),
      row('y', 'ab', 'Γάλα Πλήρες 1lt', 1),
      row('x', 'masoutis', 'Γάλα Ελαφρύ 1lt', 1),
    ]);
    expect(picks[0].deal.id).toBe('x');
  });

  it('keeps the ESSENTIALS order in the output', () => {
    const picks = pickEssentials([
      row('p1', 'lidl', 'My Kouzina Πέννες Ριγέ 1kg', 1.05, 'Είδη Παντοπωλείου'),
      row('p2', 'ab', 'MISKO ΣΠΑΓΓΕΤΙ Ν.6 500ΓΡ', 1.12, 'Είδη Παντοπωλείου'),
      row('m1', 'lidl', 'Γάλα Πλήρες 1lt', 1.19),
      row('m2', 'ab', 'Γάλα Ελαφρύ 1lt', 1.09),
    ]);
    expect(picks.map((p) => p.id)).toEqual(['milk', 'pasta']);
  });
});
