import { describe, it, expect } from 'vitest';
import { familyKey, capPerFamily, spreadFamilies } from './deal-family';

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

describe('spreadFamilies', () => {
  const row = (productName: string) => ({ productName });

  it('moves a repeat until its family is `gap` rows back, keeping every row', () => {
    const input = [row('Misko Φιογκάκι'), row('Misko Τριβελάκι'), row('Ariel Alpine'), row('Fairy Platinum'), row('Softex Χαρτί'), row('Misko Κοφτό')];
    const out = spreadFamilies(input, 3);
    expect(out.map((r) => r.productName)).toEqual(['Misko Φιογκάκι', 'Ariel Alpine', 'Fairy Platinum', 'Softex Χαρτί', 'Misko Τριβελάκι', 'Misko Κοφτό']);
    expect(out).toHaveLength(input.length);
  });

  it('appends rows that never clear, in their original order', () => {
    const input = [row('Ariel A'), row('Misko 1'), row('Misko 2'), row('Misko 3')];
    expect(spreadFamilies(input, 3).map((r) => r.productName)).toEqual(['Ariel A', 'Misko 1', 'Misko 2', 'Misko 3']);
  });

  it('leaves an already varied list untouched', () => {
    const input = [row('Ariel A'), row('Misko 1'), row('Fairy F'), row('Softex S')];
    expect(spreadFamilies(input, 3)).toEqual(input);
  });
});
