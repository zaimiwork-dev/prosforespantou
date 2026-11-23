import { describe, expect, it } from 'vitest';
import { atChain, basketText, cheaperElsewhere, compareBasket, type ItemPrices } from './list-basket';

const fmt = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const NAMES: Record<string, string> = { ab: 'AB Vassilopoulos', sklavenitis: 'Σκλαβενίτης', masoutis: 'Μασούτης', mymarket: 'My Market', lidl: 'Lidl' };
const nameOf = (c: string) => NAMES[c] ?? c;

const at = (chain: string, price: number, elsewhere: [string, number][] = [], live = true): ItemPrices => ({
  chain,
  price,
  live,
  elsewhere: elsewhere.map(([c, p]) => ({ chain: c, price: p, kind: 'offer' as const })),
});

describe('compareBasket', () => {
  it('names the chain that has the whole list for less', () => {
    const items = [
      { id: 'a', chain: 'masoutis', price: 2, quantity: 1 },
      { id: 'b', chain: 'masoutis', price: 3, quantity: 2 },
    ];
    const c = compareBasket(items, {
      a: at('masoutis', 2, [['sklavenitis', 1.5]]),
      b: at('masoutis', 3, [['sklavenitis', 2.5], ['ab', 2]]),
    });
    expect(c.items).toBe(2);
    expect(c.compared).toBe(2);
    expect(c.listTotal).toBe(8);
    expect(c.whole).toMatchObject({ chain: 'sklavenitis', found: 2, cost: 6.5, listCost: 8 });
    // All items first, then most items.
    expect(c.chains.map((b) => b.chain)).toEqual(['sklavenitis', 'ab']);
    // AB has only item b (×2): compared with what b costs on the list.
    expect(c.chains[1]).toMatchObject({ found: 1, cost: 4, listCost: 6, moved: 1 });

    const t = basketText(c, fmt, nameOf);
    expect(t.lead).toBe('Όλη η λίστα κοστίζει λιγότερο στον Σκλαβενίτη: 6,50 € αντί 8,00 €.');
    expect(t.rows[0]).toMatchObject({ label: 'Όλα τα προϊόντα σου: 6,50 €', detail: '1,50 € λιγότερα από τώρα', tone: 'cheaper' });
    expect(t.rows[1]).toMatchObject({ label: '1 από τα 2 προϊόντα σου: 4,00 €', detail: '2,00 € λιγότερα από τώρα', tone: 'cheaper' });
  });

  it('says the list is already at the cheapest chain when another chain has everything for more', () => {
    const items = [
      { id: 'a', chain: 'ab', price: 2, quantity: 1 },
      { id: 'b', chain: 'ab', price: 3, quantity: 1 },
    ];
    const c = compareBasket(items, {
      a: at('ab', 2, [['lidl', 2.2]]),
      b: at('ab', 3, [['lidl', 3]]),
    });
    expect(c.whole).toMatchObject({ chain: 'ab', moved: 0, cost: 5 });
    const t = basketText(c, fmt, nameOf);
    expect(t.lead).toBe('Όλη η λίστα σου είναι ήδη στο φθηνότερο κατάστημα.');
    // The list's own chain is not a row (nothing would move there).
    expect(t.rows).toEqual([{ chain: 'lidl', label: 'Όλα τα προϊόντα σου: 5,20 €', detail: '0,20 € περισσότερα από τώρα', tone: 'dearer' }]);
  });

  it('never totals a chain that lacks items against the whole list', () => {
    const items = [
      { id: 'a', chain: 'masoutis', price: 2, quantity: 1 },
      { id: 'b', chain: 'masoutis', price: 3, quantity: 1 },
      { id: 'c', chain: 'masoutis', price: 10, quantity: 1 },
    ];
    const c = compareBasket(items, {
      a: at('masoutis', 2, [['sklavenitis', 2]]),
      b: at('masoutis', 3, [['sklavenitis', 2.5]]),
      c: at('masoutis', 10),
    });
    expect(c.whole).toBeNull();
    expect(c.chains).toEqual([{ chain: 'sklavenitis', found: 2, cost: 4.5, listCost: 5, moved: 2 }]);
    const t = basketText(c, fmt, nameOf);
    expect(t.lead).toBe('Βρήκαμε 2 από τα 3 προϊόντα σου και σε άλλα καταστήματα.');
    expect(t.rows[0].label).toBe('2 από τα 3 προϊόντα σου: 4,50 €');
  });

  it('compares a list spread over chains with a chain that has it all', () => {
    const items = [
      { id: 'a', chain: 'ab', price: 2, quantity: 1 },
      { id: 'b', chain: 'masoutis', price: 3, quantity: 1 },
    ];
    const c = compareBasket(items, {
      a: at('ab', 2, [['sklavenitis', 1.9], ['masoutis', 2.4]]),
      b: at('masoutis', 3, [['sklavenitis', 2.9], ['ab', 3.5]]),
    });
    expect(c.whole).toMatchObject({ chain: 'sklavenitis', cost: 4.8 });
    // Each chain's own item counts at the list price.
    expect(c.chains.find((b) => b.chain === 'ab')).toMatchObject({ found: 2, cost: 5.5, listCost: 5, moved: 1 });
    expect(basketText(c, fmt, nameOf).lead).toBe('Όλη η λίστα κοστίζει λιγότερο στον Σκλαβενίτη: 4,80 € αντί 5,00 €.');
  });

  it('makes no «whole list» claim when the chain with everything costs more than the list split as it is', () => {
    const items = [
      { id: 'a', chain: 'ab', price: 2, quantity: 1 },
      { id: 'b', chain: 'masoutis', price: 3, quantity: 1 },
    ];
    const c = compareBasket(items, {
      a: at('ab', 2, [['masoutis', 2.4]]),
      b: at('masoutis', 3, [['ab', 3.5]]),
    });
    expect(c.whole?.moved).toBe(1);
    expect(basketText(c, fmt, nameOf).lead).toBe('Βρήκαμε και τα 2 προϊόντα σου σε άλλα καταστήματα.');
  });

  it('leaves out an offer that has ended, and items with no price elsewhere make no card', () => {
    const items = [
      { id: 'a', chain: 'ab', price: 2, quantity: 1 },
      { id: 'b', chain: 'ab', price: 3, quantity: 1 },
    ];
    const c = compareBasket(items, {
      a: at('ab', 2, [['lidl', 1]], false),
      b: at('ab', 3),
    });
    expect(c.items).toBe(1);
    expect(c.compared).toBe(0);
    expect(basketText(c, fmt, nameOf).lead).toBeNull();
    // Unknown ids (not returned by the server) are left out too.
    expect(compareBasket(items, {}).items).toBe(0);
  });

  it('uses the cheapest row per chain and ignores rows at the item\'s own chain', () => {
    const c = compareBasket([{ id: 'a', chain: 'ab', price: 2, quantity: 3 }], {
      a: at('ab', 2, [['ab', 1], ['lidl', 1.8], ['lidl', 1.5]]),
    });
    expect(c.chains).toEqual([{ chain: 'lidl', found: 1, cost: 4.5, listCost: 6, moved: 1 }]);
    const t = basketText(c, fmt, nameOf);
    expect(t.lead).toBe('Όλη η λίστα κοστίζει λιγότερο στα Lidl: 4,50 € αντί 6,00 €.');
    expect(t.rows[0].label).toBe('Το προϊόν σου: 4,50 €');
  });

  it('names a cheaper chain in the headline only from a 0,10 € saving', () => {
    const items = [{ id: 'a', chain: 'masoutis', price: 4.97, quantity: 1 }];
    const small = compareBasket(items, { a: at('masoutis', 4.97, [['sklavenitis', 4.9]]) });
    const t = basketText(small, fmt, nameOf);
    expect(t.lead).toBe('Βρήκαμε το προϊόν σου και σε άλλα καταστήματα.');
    expect(t.rows[0]).toMatchObject({ detail: '0,07 € λιγότερα από τώρα', tone: 'cheaper' });
    const enough = compareBasket(items, { a: at('masoutis', 4.97, [['sklavenitis', 4.87]]) });
    expect(basketText(enough, fmt, nameOf).lead).toBe('Όλη η λίστα κοστίζει λιγότερο στον Σκλαβενίτη: 4,87 € αντί 4,97 €.');
  });

  it('calls an equal price «ίδια τιμή»', () => {
    const c = compareBasket([{ id: 'a', chain: 'ab', price: 2, quantity: 1 }], { a: at('ab', 2, [['mymarket', 2]]) });
    const t = basketText(c, fmt, nameOf);
    expect(t.rows[0]).toMatchObject({ detail: 'ίδια τιμή με τώρα', tone: 'same' });
    expect(t.lead).toBe('Βρήκαμε το προϊόν σου και σε άλλα καταστήματα.');
  });
});

describe('cheaperElsewhere', () => {
  const item = { id: 'a', chain: 'masoutis', price: 4.99, quantity: 2 };
  it('picks the cheapest other chain, shelf prices included', () => {
    const p: ItemPrices = {
      chain: 'masoutis', price: 4.99, live: true,
      elsewhere: [
        { chain: 'sklavenitis', price: 4.6, kind: 'offer', offerId: 'o1' },
        { chain: 'ab', price: 4.5, kind: 'shelf' },
        { chain: 'masoutis', price: 3, kind: 'offer', offerId: 'own' },
      ],
    };
    expect(cheaperElsewhere(item, p)).toEqual({ chain: 'ab', price: 4.5, kind: 'shelf', offerId: null, savings: 0.49 });
  });
  it('prefers an offer on a tie, needs a 0,10 € saving and a live offer', () => {
    const tie: ItemPrices = {
      chain: 'masoutis', price: 4.99, live: true,
      elsewhere: [{ chain: 'ab', price: 4.5, kind: 'shelf' }, { chain: 'lidl', price: 4.5, kind: 'offer', offerId: 'o2' }],
    };
    expect(cheaperElsewhere(item, tie)?.chain).toBe('lidl');
    expect(cheaperElsewhere(item, at('masoutis', 4.99, [['ab', 4.9]]))).toBeNull();
    expect(cheaperElsewhere(item, at('masoutis', 4.99, [['ab', 4.89]]))?.savings).toBe(0.1);
    expect(cheaperElsewhere(item, at('masoutis', 4.99, [['ab', 1]], false))).toBeNull();
    expect(cheaperElsewhere(item, undefined)).toBeNull();
  });
});

describe('atChain', () => {
  it('puts the Greek article after «σε»', () => {
    expect(atChain('sklavenitis', 'Σκλαβενίτης')).toBe('στον Σκλαβενίτη');
    expect(atChain('masoutis', 'Μασούτης')).toBe('στον Μασούτη');
    expect(atChain('lidl', 'Lidl')).toBe('στα Lidl');
    expect(atChain('mymarket', 'My Market')).toBe('στο My Market');
  });
});
