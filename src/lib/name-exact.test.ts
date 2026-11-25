import { describe, expect, it } from 'vitest';
import { brandKeySet, sameWordsAndSize, statesBrand, wordIdenticalLink } from './name-exact';

describe('sameWordsAndSize', () => {
  it('links the same words written differently', () => {
    expect(sameWordsAndSize('NESCAFÉ® CLASSIC ΣΤΙΓΜΙΑΙΟΣ ΚΑΦΕΣ 200g', 'Nescafe Classic Καφές Στιγμιαίος 200γρ.')).toBe(true);
    expect(sameWordsAndSize('Χρυσελιά Κλασικό Ελαιόλαδο 2lt', 'ΧΡΥΣΕΛΙΑ ΚΛΑΣΙΚΟ ΕΛΑΙΟΛΑΔΟ 2LT.')).toBe(true);
    expect(sameWordsAndSize('Colgate Max White One Οδοντόκρεμα 75ml', 'COLGATE Οδοντόκρεμα Max White One 75ml')).toBe(true);
  });

  it('does not link different sizes', () => {
    expect(sameWordsAndSize('Nescafe Classic Καφές Στιγμιαίος 200γρ.', 'Nescafe Classic Καφές Στιγμιαίος 100γρ.')).toBe(false);
  });

  it('does not link when one name has a word the other lacks', () => {
    expect(sameWordsAndSize('Nescafe Classic Decaf Στιγμιαίος 100g', 'Nescafe Classic Στιγμιαίος 100g')).toBe(false);
    expect(sameWordsAndSize('Nescafe Στιγμιαίος Καφές 200gr', 'Nescafe Classic Στιγμιαίος Καφές 200gr')).toBe(false);
  });

  it('a link needs each name to state its product brand', () => {
    const nes = { name: 'NESCAFÉ® CLASSIC ΣΤΙΓΜΙΑΙΟΣ ΚΑΦΕΣ 200g', brand: 'NESCAFE' };
    expect(wordIdenticalLink(nes, { name: 'Nescafe Classic Καφές Στιγμιαίος 200γρ.', brand: 'Nescafe' })).toBe(true);
    // AB's brandless milk vs a store's own label with the same words.
    expect(wordIdenticalLink(
      { name: 'Φρέσκο Γάλα Πλήρες 1lt', brand: 'ΔΕΛΤΑ' },
      { name: 'Φρέσκο Γάλα Πλήρες 1lt', brand: null },
    )).toBe(false);
    // No brand on record: the name must start with a known brand.
    const keys = brandKeySet(['NESCAFE', 'ΜΙΝΕΡΒΑ', 'ΔΕΛΤΑ']);
    expect(wordIdenticalLink(
      { name: 'Μινέρβα Ελαιόλαδο Κλασικό 2lt', brand: null },
      { name: 'ΜΙΝΕΡΒΑ Ελαιόλαδο Κλασικό 2lt', brand: 'ΜΙΝΕΡΒΑ' }, keys)).toBe(true);
    expect(wordIdenticalLink(
      { name: 'Φρέσκο Γάλα Πλήρες 1lt', brand: null },
      { name: 'Φρέσκο Γάλα Πλήρες 1lt', brand: null }, keys)).toBe(false);
    expect(statesBrand('ΙΟΝ Κουβερτούρα Λευκή 125g', 'ION')).toBe(true);
    expect(statesBrand('Στιγμιαίος Καφές 200gr', 'NESCAFE')).toBe(false);
    expect(statesBrand('Ταμπόν Pro Comfort Super 16τεμ', 'O.B.')).toBe(false);
  });

  it('needs a stated size on both sides and more than a brand', () => {
    expect(sameWordsAndSize('Lacta Σοκολάτα Γάλακτος 85gr', 'Lacta Σοκολάτα Γάλακτος')).toBe(false);
    expect(sameWordsAndSize('Lacta 85g', 'LACTA 85gr')).toBe(false);
    expect(sameWordsAndSize('', 'Lacta Σοκολάτα 85g')).toBe(false);
  });
});
