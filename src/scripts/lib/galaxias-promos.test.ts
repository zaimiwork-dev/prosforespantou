import { describe, expect, it } from 'vitest';
import { galaxiasPrice, ruleKind, ruleActive } from './galaxias-promos.mjs';

const TODAY = '2026-11-23';
const rule = (o: Record<string, unknown>) => ({ from: '2026-11-11', to: '2026-11-24', stores: 'All Stores', is_silent: false, qty: 1, tags: [], ...o });

describe('ruleKind (ported from galaxias.shop)', () => {
  it('classifies like their frontend', () => {
    expect(ruleKind(rule({ promoType: 'percent_discount', action_name: 'percent', actions: { amount: 15 } }))).toBe('unitDiscount');
    expect(ruleKind(rule({ promoType: 'dorean_deigma', action_name: 'cheapest', qty: 2 }))).toBe('offer');
    expect(ruleKind(rule({ promoType: 'percent_discount', action_name: 'percent', qty: 2 }))).toBe('offer');
    expect(ruleKind(rule({ promoType: 'bravo_bonus', action_name: 'fixed' }))).toBe('bravoBonus');
    expect(ruleKind(rule({ name: '5€ ΔΩΡΟΕΠΙΤΑΓΗ', action_name: 'fixed' }))).toBe('giftVoucher');
  });
});

describe('ruleActive', () => {
  it('needs today inside from–to and every store', () => {
    expect(ruleActive(rule({}), TODAY)).toBe(true);
    expect(ruleActive(rule({ to: '2026-11-22 23:59:59' }), TODAY)).toBe(false);
    expect(ruleActive(rule({ from: '2026-11-24' }), TODAY)).toBe(false);
    expect(ruleActive(rule({ stores: 'Καβάλα 2' }), TODAY)).toBe(false);
  });
});

describe('galaxiasPrice', () => {
  it('a visible −15% is an offer with the regular price struck through (their rounding)', () => {
    const r = galaxiasPrice(1.3, [rule({ promoType: 'percent_discount', action_name: 'percent', actions: { amount: 15 } })], TODAY);
    expect(r.offer).toEqual({ price: 1.1, originalPrice: 1.3, label: null, kind: 'discount', leaflet: false, validFrom: '2026-11-11', validUntil: '2026-11-24' });
    expect(r.shelf).toBe(1.3);
  });

  it('a silent rule of a campaign («ΦΥΛΛΑΔΙΟ») is an offer, filed under the leaflet; dates come as arrays', () => {
    const r = galaxiasPrice(4.23, [rule({
      name: '-40% BABYCARE ΜΩΡΟΠ.99% WATER TR.PACK 3Χ', promoType: 'percent_discount', action_name: 'percent',
      actions: { amount: '40' }, is_silent: true, tags: ['ΦΥΛΛΑΔΙΟ'], from: ['2026-11-11'], to: ['2026-11-24'], stores: ['All Stores'],
    })], TODAY);
    expect(r.offer).toMatchObject({ price: 2.53, originalPrice: 4.23, kind: 'discount', leaflet: true, validUntil: '2026-11-24' });
    expect(r.shelf).toBe(4.23);
  });

  it('a silent rule with no campaign, or a card-points campaign, is not an offer', () => {
    expect(galaxiasPrice(2, [rule({ action_name: 'percent', actions: { amount: 10 }, is_silent: true })], TODAY)).toEqual({ shelf: 2, offer: null });
    expect(galaxiasPrice(2, [rule({ action_name: 'percent', actions: { amount: 10 }, tags: ['EXTRA_BONUS'] })], TODAY).offer).toBeNull();
  });

  it('1+1 and «with 2 items» deals keep the one-item price and carry the deal as the sticker', () => {
    const one = galaxiasPrice(2.98, [rule({ name: '1+1 ΛΟΥΜΙΔΗΣ ΕΚΑΣΤΟΣ 90ΓΡ.', promoType: 'dorean_deigma', action_name: 'cheapest', qty: 2, actions: { amount: 1 } })], TODAY);
    expect(one.offer).toMatchObject({ price: 2.98, originalPrice: null, label: '1+1 Δώρο', kind: 'multibuy' });
    const two = galaxiasPrice(0.88, [rule({ name: '-10% ΜΕ ΑΓΟΡΑ 2 ΤΕΜ. KNORR', promoType: 'percent_discount', action_name: 'percent', qty: 2, actions: { amount: 10 } })], TODAY);
    expect(two.offer).toMatchObject({ price: 0.88, label: '-10% με αγορά 2 τεμ.' });
  });

  it('ignores points, vouchers, ended and one-store rules', () => {
    expect(galaxiasPrice(1.72, [rule({ promoType: 'bravo_bonus', action_name: 'fixed', actions: { amount: 0.36 } })], TODAY).offer).toBeNull();
    expect(galaxiasPrice(3, [rule({ action_name: 'percent', actions: { amount: 20 }, to: '2026-11-20' })], TODAY).offer).toBeNull();
    expect(galaxiasPrice(3, [rule({ action_name: 'percent', actions: { amount: 20 }, stores: 'Λάρισα' })], TODAY).offer).toBeNull();
  });
});
