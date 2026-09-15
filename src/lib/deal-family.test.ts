import { describe, it, expect } from 'vitest';
import { familyKey, capPerFamily } from './deal-family';

describe('familyKey / capPerFamily', () => {
  it('three Έλμα gums share one family; COCA COLA and COCA-COLA too', () => {
    const a = familyKey('Έλμα Τσίχλα Δυόσμος Χωρίς Ζάχαρη');
    const b = familyKey('ΕΛΜΑ Τσίχλα Με Μαστιχέλαιο Χωρίς Ζάχαρη 13gr');
    const c = familyKey('Έλμα Τσίχλα Κουφέτο Χωρίς Ζάχαρη 13gr');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(familyKey('COCA COLA Αναψυκτικό ποικιλία')).toBe(familyKey('COCA-COLA Zero 8x330ml'));
  });

  it('different brands keep different keys; one brand is one family (by design)', () => {
    expect(familyKey('Misko Ζυμαρικά Πενάκι 500gr')).not.toBe(familyKey('Dixan Gel Απορρυπαντικό'));
    // A showcase shows one ΔΕΛΤΑ item; the yogurt is one tap away in /deals.
    expect(familyKey('ΔΕΛΤΑ Γάλα 1,5lt')).toBe(familyKey('ΔΕΛΤΑ Γιαούρτι 200gr'));
  });

  it('short first words fall back to two words (private labels)', () => {
    expect(familyKey('My Soft Χαρτί Υγείας')).not.toBe(familyKey('My Home Ποτήρι Νερού'));
    expect(familyKey("The Chef's Way Ελαιόλαδο")).toBe('the chefs');
  });

  it('capPerFamily keeps the first (highest-ranked) row per family and preserves order', () => {
    const rows = [
      { productName: 'Rispet Πανάκια' },
      { productName: 'Έλμα Τσίχλα Δυόσμος' },
      { productName: 'ΕΛΜΑ Τσίχλα Μαστίχα' },
      { productName: 'Cardinal Γάλα Καρύδας' },
      { productName: 'Έλμα Τσίχλα Κουφέτο' },
    ];
    expect(capPerFamily(rows).map((r) => r.productName)).toEqual([
      'Rispet Πανάκια',
      'Έλμα Τσίχλα Δυόσμος',
      'Cardinal Γάλα Καρύδας',
    ]);
  });

  it('rows without a usable name pass through', () => {
    expect(capPerFamily([{ productName: null }, { productName: 'ab' }])).toHaveLength(2);
  });
});
