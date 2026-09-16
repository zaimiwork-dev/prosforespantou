import { describe, it, expect } from 'vitest';
import { packCount, samePack, statedPieces } from './packaging';

describe('packCount', () => {
  it('reads multibuy bundles', () => {
    expect(packCount('Coca Cola 330ml. 5+1Δώρο')).toBe(6);
    expect(packCount('ΜΠΥΡΑ ΝΥΜΦΗ ΚΟΥΤΙ LAGER 6*330ML')).toBe(6);
    expect(packCount('Nutri Valley 6x250ml')).toBe(6);
  });

  it('single units default to 1', () => {
    expect(packCount('ΒΕΡΓΙΝΑ ΜΠΥΡΑ ΚΟΥΤΙ 330ML')).toBe(1);
    expect(packCount(null)).toBe(1);
  });

  it('does not read sun factors or glued codes as multibuys', () => {
    // "SPF50+ 40ml" used to parse as a 50+40=90 multibuy and break samePack
    // for identical sunscreens (2026-06-12 mapping audit).
    expect(packCount('Nivea Sun Face Mat Look Cream SPF50+ 40ml')).toBe(1);
    expect(packCount('Carroten Αντηλιακή Κρέμα Sensicare SPF50+ 50ml.')).toBe(1);
  });
});

describe('samePack', () => {
  it('same sunscreen with and without the SPF plus agrees', () => {
    expect(samePack('NIVEA SUN UV FACE LUMINOUS 630 SPF50+ 40ML', 'Nivea Sun Face Luminous 630 SPF50 40ml')).toBe(true);
  });

  it('multipack vs single still disagrees', () => {
    expect(samePack('Μακεδονικός Χαλβάς Με Σοκολάτα 16x40gr', 'Μακεδονικός Χαλβάς Με Σοκολάτα 40γρ.')).toBe(false);
  });
});

// Stated piece counts (2026-09-16). Fairy Platinum 19τεμ and 30τεμ shared one
// Product record and rendered as each other's price rival at 8.99€ vs 17.98€.
describe('statedPieces', () => {
  it('reads a plain count', () => {
    expect(statedPieces('Fairy Platinum Κάψουλες Πλυντηρίου Πιάτων 30τεμ.')).toBe(30);
    expect(statedPieces('Χαρτί Υγείας Cotton 12 ρολά')).toBe(12);
    expect(statedPieces('Snack Σκύλων Schmackos Multi Mix 20 Τεμάχια')).toBe(20);
  });

  it('multiplies a multipack written in pieces', () => {
    expect(statedPieces('Septona Μωρομάντηλα 4x12τεμ')).toBe(48);
    expect(statedPieces('Babycare Μωρομάντηλα 3x100τεμ.')).toBe(300);
  });

  it('says nothing when the name states nothing', () => {
    expect(statedPieces('Fairy Υγρό Πιάτων 900ml')).toBeNull();
    expect(statedPieces('ΝΩΜΑ Αυγά φρέσκα Μ')).toBeNull();
    expect(statedPieces(null)).toBeNull();
  });

  it('ignores a count glued to a word', () => {
    expect(statedPieces('Κρέμα SPF50 Αντηλιακό')).toBeNull();
  });
});

describe('samePack with stated pieces', () => {
  it('separates two pack sizes of the same product', () => {
    expect(samePack('Fairy Platinum Κάψουλες 19τεμ.', 'Fairy Platinum Κάψουλες 30τεμ.')).toBe(false);
    expect(samePack('Schmackos Multi Mix 5 Τεμάχια', 'Schmackos Multi Mix 20 Τεμάχια')).toBe(false);
  });

  it('still compares when only one chain prints the count', () => {
    expect(samePack('Fairy Platinum Κάψουλες 30τεμ.', 'FAIRY Platinum Κάψουλες Πλυντηρίου Πιάτων')).toBe(true);
  });

  // packCount has always read «4x12» as a 4-unit multipack, so these two
  // spellings of 48 wipes were never compared with each other. statedPieces
  // does not change that — it only ever ADDS a reason to refuse.
  it('leaves the existing multipack rule as it was', () => {
    expect(samePack('Μωρομάντηλα 4x12τεμ', 'Μωρομάντηλα 48τεμ')).toBe(false);
    expect(samePack('Μωρομάντηλα 4x12τεμ', 'Μωρομάντηλα 4x12τεμ Value')).toBe(true);
  });

  it('keeps the multibuy rule', () => {
    expect(samePack('Μπίρα Κουτί 330ml (9+3 Δώρο)', 'Μπίρα Κουτί 330ml')).toBe(false);
  });
});
