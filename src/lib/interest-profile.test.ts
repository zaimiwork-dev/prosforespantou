import { describe, it, expect } from 'vitest';
import {
  EMPTY_PROFILE,
  WEIGHT,
  bumpProfile,
  decayProfile,
  scoreOffer,
  topCategories,
  brandToken,
} from './interest-profile';

const DAY = 86400000;
const T0 = 1_750_000_000_000;

describe('brandToken', () => {
  it('takes the accent-stripped first word', () => {
    expect(brandToken('Παπαδοπούλου Μπισκότα Γεμιστά')).toBe('παπαδοπουλου');
    expect(brandToken("Lay's Πατατάκια")).toBe('lays');
  });
  it('rejects short/empty tokens', () => {
    expect(brandToken('ΟΝ Bar')).toBe(null);
    expect(brandToken(null)).toBe(null);
  });
});

describe('decay', () => {
  it('halves weights after one half-life (14 days)', () => {
    const p = bumpProfile(EMPTY_PROFILE, { category: 'Κάβα', productName: 'ΝΥΜΦΗ Μπίρα' }, 4, T0);
    const later = decayProfile(p, T0 + 14 * DAY);
    expect(later.categories['Κάβα']).toBeCloseTo(2, 5);
    expect(later.brands['νυμφη']).toBeCloseTo(2, 5);
  });

  it('prunes signals that decayed to noise', () => {
    const p = bumpProfile(EMPTY_PROFILE, { category: 'Κάβα', productName: 'ΝΥΜΦΗ Μπίρα' }, WEIGHT.view, T0);
    const months = decayProfile(p, T0 + 120 * DAY);
    expect(months.categories['Κάβα']).toBeUndefined();
  });
});

describe('scoreOffer', () => {
  it('declared category beats learned noise; brand history stacks', () => {
    let p = EMPTY_PROFILE;
    for (let i = 0; i < 3; i++) {
      p = bumpProfile(p, { category: 'Βρεφικά Είδη', productName: 'Pampers Πάνες No4' }, WEIGHT.listAdd, T0);
    }
    const declared = ['Κατεψυγμένα'];

    const frozen = scoreOffer({ category: 'Κατεψυγμένα', productName: 'Μπάρμπα Στάθης Αρακάς' }, p, declared);
    const diapers = scoreOffer({ category: 'Βρεφικά Είδη', productName: 'Pampers Premium Πάνες No5' }, p, declared);
    const random = scoreOffer({ category: 'Κάβα', productName: 'Τυχαία Μπίρα' }, p, declared);

    expect(frozen).toBeGreaterThan(random);
    expect(diapers).toBeGreaterThan(random);
    // 9 list-add points + brand match should outrank a bare declared category.
    expect(diapers).toBeGreaterThan(frozen);
  });

  it('empty profile + no declared = 0', () => {
    expect(scoreOffer({ category: 'Κάβα', productName: 'Μπίρα' }, EMPTY_PROFILE, [])).toBe(0);
  });
});

describe('topCategories', () => {
  it('orders by accumulated weight', () => {
    let p = bumpProfile(EMPTY_PROFILE, { category: 'Κάβα', productName: 'A Μπίρα' }, 1, T0);
    p = bumpProfile(p, { category: 'Βρεφικά Είδη', productName: 'B Πάνες' }, 5, T0);
    expect(topCategories(p, 2)).toEqual(['Βρεφικά Είδη', 'Κάβα']);
  });
});
