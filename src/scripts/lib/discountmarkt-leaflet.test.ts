import { describe, expect, it } from 'vitest';
import { parseHeaderDates, unitPriceCheck, multiBuy, displayName, itemCode, prepareOffers, validBox } from './discountmarkt-leaflet.mjs';

describe('validBox — a reader\'s photo box', () => {
  it('keeps a sane box and rejects slivers, out-of-page and malformed ones', () => {
    expect(validBox([0.05, 0.1, 0.3, 0.32])).toEqual([0.05, 0.1, 0.3, 0.32]);
    expect(validBox([0.05, 0.1, 0.07, 0.32])).toBeNull();
    expect(validBox([0.05, 0.1, 1.3, 0.32])).toBeNull();
    expect(validBox(null)).toBeNull();
    expect(validBox([0.1, 0.2, 0.3])).toBeNull();
  });
});

const kg = (size: string | null, price: number, perUnit: number, extra = {}) =>
  unitPriceCheck({ size, price, perUnit, perUnitOf: 'κιλό', priceFor: 'item', ...extra });

describe('parseHeaderDates', () => {
  it('reads the printed Greek day range', () => {
    expect(parseHeaderDates('ΑΠΟ ΔΕΥΤΕΡΑ 23/11 ΕΩΣ ΣΑΒΒΑΤΟ 28/11', new Date('2026-11-25'))).toEqual({
      validFrom: '2026-11-22T22:00:00.000Z',
      validUntil: '2026-11-28T21:59:59.000Z',
    });
  });
  it('rolls a range over the new year', () => {
    expect(parseHeaderDates('ΑΠΟ 28/12 ΕΩΣ 03/01', new Date('2026-12-27'))?.validUntil).toBe('2027-01-03T21:59:59.000Z');
  });
  it('returns null without dates', () => {
    expect(parseHeaderDates('ΦΟΥΡΝΟΣ')).toBeNull();
  });
});

describe('unitPriceCheck — the leaflet checks its own prices', () => {
  it('confirms right readings in the leaflet\'s many size forms', () => {
    expect(kg('280γρ', 0.79, 2.82)).toBe('ok');
    expect(kg('50γρ 2τεμ', 2.15, 21.5)).toBe('ok'); // 2 × 50 g
    expect(kg('10τεμ 400γρ', 2.25, 5.63)).toBe('ok'); // 400 g in all
    expect(kg('350γρ', 1.25, 6.58, { variants: 'στραγγιστό βάρος 190γρ' })).toBe('ok'); // drained weight
    expect(unitPriceCheck({ size: '330ml', price: 6.36, perUnit: 2.41, perUnitOf: 'λίτρο', note: '6+2 Δώρο' })).toBe('ok');
    expect(unitPriceCheck({ size: null, variants: 'night 16τεμ / long 18τεμ / normal 20τεμ', price: 2.29, perUnit: 0.11, perUnitOf: 'τεμάχιο' })).toBe('ok');
    expect(unitPriceCheck({ size: 'ρολό 1,5m', price: 1.59, perUnit: 1.06, perUnitOf: 'μέτρο' })).toBe('ok');
  });
  it('catches a misread price', () => {
    expect(kg('280γρ', 0.97, 2.82)).toBe('mismatch');
  });
  it('does not judge what it cannot check', () => {
    expect(unitPriceCheck({ size: '78μεζ', price: 4.35, perUnit: 0.06, perUnitOf: 'μεζούρα' })).toBe('unchecked');
    expect(unitPriceCheck({ size: '78μεζ 1638ml', price: 4.35, perUnit: 0.06, perUnitOf: null })).toBe('unchecked');
    expect(unitPriceCheck({ size: null, price: 3.89, perUnit: null, priceFor: 'portion' })).toBe('unchecked');
  });
});

describe('names and codes', () => {
  it('puts brand, variants, size and the multi-buy in the card name', () => {
    expect(displayName({ name: 'BISCOMANIA soft cake', variants: 'πορτοκάλι / βύσσινο', size: '125γρ' })).toBe('BISCOMANIA soft cake πορτοκάλι / βύσσινο 125γρ');
    expect(displayName({ name: 'MYTHOS μπύρα', size: '330ml', note: '6+2 Δώρο' })).toBe('MYTHOS μπύρα 330ml 6+2 Δώρο');
    expect(displayName({ name: 'Παστίτσιο', priceFor: 'portion' })).toBe('Παστίτσιο (η μερίδα)');
  });
  it('reads multi-buys, not oil grades or fractions', () => {
    expect(multiBuy('2+1 Δώρο, τιμή ΤΟ ΤΕΜ.')).toEqual({ pay: 2, get: 3 });
    expect(multiBuy('15W-40')).toBeNull();
  });
  it('gives the same product the same code whatever the case or accents', () => {
    expect(itemCode({ name: 'ΔΕΡΜΙΣΗΣ κουραμπιέδες', size: '320γρ' })).toBe(itemCode({ name: 'δερμισης ΚΟΥΡΑΜΠΙΕΔΕΣ', size: '320 γρ' }));
  });
});

describe('prepareOffers', () => {
  it('drops misreads and unconfirmed doubts, merges duplicates, keeps confirmed doubts', () => {
    const { offers, dropped } = prepareOffers([
      { page: 15, name: 'VIAKAL κατά των αλάτων', size: '500ml', price: 2.99, perUnit: 5.98, perUnitOf: 'λίτρο', sure: true },
      { page: 15, name: 'VIAKAL κατά των αλάτων', size: '500ml', price: 2.99, sure: true },
      { page: 3, name: 'Μπαγκέτα', size: '280γρ', price: 0.97, perUnit: 2.82, perUnitOf: 'κιλό', sure: true },
      { page: 17, name: 'Καλαμπόκι', size: '340γρ', price: 0.79, perUnit: 2.32, perUnitOf: 'κιλό', sure: false },
      { page: 1, name: 'Χαρτί υγείας', size: null, price: 5.99, sure: false },
    ]);
    expect(offers.map((o: { name: string }) => o.name)).toEqual(['VIAKAL κατά των αλάτων 500ml', 'Καλαμπόκι 340γρ']);
    expect(dropped).toHaveLength(2);
  });
});
