import { describe, it, expect } from 'vitest';
import { computeHotScore, DEPT_PRIOR } from './hotness';

// The live top-10 on 2026-09-15 was floor wipes (-65%), three Έλμα chewing
// gums (-50% + "1+1"), coconut milk and Coca-Cola ×3 — no milk, oil, coffee
// or detergent. These tests pin the shape of the fix, not exact numbers.
describe('computeHotScore — department prior + KVI-scaled mechanics', () => {
  it('a staple at the lowest price outranks -50% chewing gum with a 1+1', () => {
    const milk = computeHotScore({
      productName: 'ΔΕΛΤΑ Γάλα Φρέσκο 1,5lt',
      category: 'Γαλακτοκομικά & Είδη Ψυγείου',
      priceVerdict: 'lowest',
    });
    const gum = computeHotScore({
      productName: 'Έλμα Τσίχλα Δυόσμος Χωρίς Ζάχαρη 13gr',
      description: '1+1 ΔΩΡΟ',
      category: 'Σνακ & Γλυκά',
      discountPercent: 50,
    });
    expect(milk).toBeGreaterThan(gum + 5);
  });

  it('the same % is worth less on a non-staple than on a staple', () => {
    const oil = computeHotScore({ productName: 'Άλτις Ελαιόλαδο 1lt', discountPercent: 30 })
      - computeHotScore({ productName: 'Άλτις Ελαιόλαδο 1lt' });
    const wipes = computeHotScore({ productName: 'Rispet Πανάκια Πατώματος 10τεμ', discountPercent: 30 })
      - computeHotScore({ productName: 'Rispet Πανάκια Πατώματος 10τεμ' });
    expect(wipes).toBeLessThan(oil);
    expect(wipes).toBeGreaterThan(0); // still counts, just not front-page
  });

  it('stacked mechanics are capped', () => {
    const stacked = computeHotScore({ productName: 'Κάτι', description: '1+1 ΔΩΡΟ SUPER ΠΡΟΣΦΟΡΑ' })
      - computeHotScore({ productName: 'Κάτι' });
    expect(stacked).toBeLessThanOrEqual(8);
  });

  it('personal care sinks, dairy rises, unknown departments are neutral', () => {
    const base = { productName: 'Προϊόν Χωρίς Λέξεις Κλειδιά' };
    const cosmetics = computeHotScore({ ...base, category: 'Προσωπική Φροντίδα' });
    const dairy = computeHotScore({ ...base, category: 'Γαλακτοκομικά & Είδη Ψυγείου' });
    const none = computeHotScore(base);
    expect(cosmetics).toBeLessThan(none);
    expect(dairy).toBeGreaterThan(none);
    expect(computeHotScore({ ...base, category: 'Δεν Υπάρχει' })).toBe(none);
  });

  it('every department in the prior table has a bounded weight', () => {
    for (const w of Object.values(DEPT_PRIOR)) {
      expect(Math.abs(w)).toBeLessThanOrEqual(5);
    }
  });
});
