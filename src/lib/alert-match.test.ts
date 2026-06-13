import { describe, it, expect } from 'vitest';
import { normalizeForAlert, alertMatchesDiscount } from './alert-match';

const base = { keyword: 'γαλα', supermarkets: [] as string[], category: null as string | null, maxPrice: null as number | null };
const milk = { productName: 'ΝΟΥΝΟΥ Γάλα Φρέσκο 1.5L', supermarket: 'ab', category: 'Γαλακτοκομικά & Είδη Ψυγείου', discountedPrice: 1.49 };

describe('normalizeForAlert', () => {
  it('lowercases and strips Greek accents', () => {
    expect(normalizeForAlert('Γάλα')).toBe('γαλα');
    // Greek final sigma is preserved (matches the original admin normalize);
    // both keyword and product name go through this, so it stays consistent.
    expect(normalizeForAlert('  ΚΑΦΈΣ ')).toBe('καφες');
  });
});

describe('alertMatchesDiscount', () => {
  it('matches on accent-insensitive keyword substring', () => {
    expect(alertMatchesDiscount(base, milk)).toBe(true);
    expect(alertMatchesDiscount({ ...base, keyword: 'καφε' }, milk)).toBe(false);
  });

  it('respects the supermarket filter (empty = any)', () => {
    expect(alertMatchesDiscount({ ...base, supermarkets: ['ab'] }, milk)).toBe(true);
    expect(alertMatchesDiscount({ ...base, supermarkets: ['lidl'] }, milk)).toBe(false);
  });

  it('respects the category filter', () => {
    expect(alertMatchesDiscount({ ...base, category: 'Γαλακτοκομικά & Είδη Ψυγείου' }, milk)).toBe(true);
    expect(alertMatchesDiscount({ ...base, category: 'Κάβα' }, milk)).toBe(false);
  });

  it('respects maxPrice (Decimal-or-number)', () => {
    expect(alertMatchesDiscount({ ...base, maxPrice: 2 }, milk)).toBe(true);
    expect(alertMatchesDiscount({ ...base, maxPrice: 1 }, milk)).toBe(false);
    expect(alertMatchesDiscount({ ...base, maxPrice: '1.49' }, milk)).toBe(true);
  });
});
