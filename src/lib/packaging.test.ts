import { describe, it, expect } from 'vitest';
import { packCount, samePack } from './packaging';

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
