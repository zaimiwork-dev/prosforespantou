import { describe, expect, it } from 'vitest';
import type { DealCard } from '@/lib/api';
import {
  applyFacets,
  chainFacets,
  departmentFacets,
  nextSort,
  sortDeals,
  splitHighlight,
  toggle,
} from './search-model';

const deal = (id: string, over: Partial<DealCard> = {}): DealCard =>
  ({ id, chain: 'ab', category: 'Κάβα', price: 1, unit: null, ...over }) as DealCard;

const list: DealCard[] = [
  deal('a', { chain: 'ab', category: 'Γαλακτοκομικά & Είδη Ψυγείου', price: 1.5, unit: { per: 'λίτρο', value: 1.5 } }),
  deal('b', { chain: 'lidl', category: 'Γαλακτοκομικά & Είδη Ψυγείου', price: 0.9, unit: { per: 'λίτρο', value: 0.9 } }),
  deal('c', { chain: 'ab', category: 'Προσωπική Φροντίδα', price: 2.5, unit: null }),
  deal('d', { chain: 'masoutis', category: 'Άλλο', price: 0.5, unit: { per: 'μεζούρα', value: 0.1 } }),
  deal('e', { chain: 'ab', category: 'Γαλακτοκομικά & Είδη Ψυγείου', price: 3, unit: { per: 'κιλό', value: 1.2 } }),
];

describe('facets', () => {
  it('counts chains, biggest first', () => {
    expect(chainFacets(list)).toEqual([
      { id: 'ab', count: 3 },
      { id: 'lidl', count: 1 },
      { id: 'masoutis', count: 1 },
    ]);
  });

  it('counts departments, skips «Άλλο» and keeps the top N', () => {
    expect(departmentFacets(list, 4)).toEqual([
      { id: 'Γαλακτοκομικά & Είδη Ψυγείου', count: 3 },
      { id: 'Προσωπική Φροντίδα', count: 1 },
    ]);
    expect(departmentFacets(list, 1)).toHaveLength(1);
  });

  it('adds choices inside a group and narrows across groups', () => {
    const ids = (s: Parameters<typeof applyFacets>[1]) => applyFacets(list, s).map((d) => d.id);
    expect(ids({ chains: [], categories: [] })).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids({ chains: ['ab', 'lidl'], categories: [] })).toEqual(['a', 'b', 'c', 'e']);
    expect(ids({ chains: ['ab'], categories: ['Γαλακτοκομικά & Είδη Ψυγείου'] })).toEqual(['a', 'e']);
  });

  it('toggles a choice on and off without mutating', () => {
    const a = ['ab'];
    expect(toggle(a, 'lidl')).toEqual(['ab', 'lidl']);
    expect(toggle(a, 'ab')).toEqual([]);
    expect(a).toEqual(['ab']);
  });
});

describe('sortDeals', () => {
  const ids = (s: Parameters<typeof sortDeals>[1]) => sortDeals(list, s).map((d) => d.id);

  it('keeps the server order for relevance', () => {
    expect(ids('relevance')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sorts by shelf price, cheapest first', () => {
    expect(ids('price')).toEqual(['d', 'b', 'a', 'c', 'e']);
  });

  it('sorts by €/κιλό-λίτρο; rows without a comparable unit price go last, in server order', () => {
    expect(ids('unit')).toEqual(['b', 'e', 'a', 'c', 'd']);
  });

  it('does not change the input array', () => {
    sortDeals(list, 'price');
    expect(list.map((d) => d.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('cycles the sort pill', () => {
    expect(nextSort('relevance')).toBe('price');
    expect(nextSort('unit')).toBe('relevance');
  });
});

describe('splitHighlight', () => {
  const join = (p: ReturnType<typeof splitHighlight>) => p.map((x) => (x.bold ? `[${x.text}]` : x.text)).join('');

  it('bolds the typed start of a phrase', () => {
    expect(join(splitHighlight('Nescafe Classic', 'nesc'))).toBe('[Nesc]afe Classic');
  });

  it('ignores accents and final sigma, keeping the original spelling', () => {
    expect(join(splitHighlight('Γάλα Δέλτα', 'γαλ'))).toBe('[Γάλ]α Δέλτα');
    expect(join(splitHighlight('Καφές', 'καφεσ'))).toBe('[Καφές]');
    expect(join(splitHighlight('ΓΑΛΑ', 'γάλ'))).toBe('[ΓΑΛ]Α');
  });

  it('finds the start of a later word', () => {
    expect(join(splitHighlight('Γάλα Δέλτα Φρέσκο', 'φρεσ'))).toBe('Γάλα Δέλτα [Φρέσ]κο');
  });

  it('does not bold the middle of a word', () => {
    expect(splitHighlight('Μεγάλα', 'γαλ')).toEqual([{ text: 'Μεγάλα', bold: false }]);
  });

  it('is plain when nothing matches or nothing was typed', () => {
    expect(splitHighlight('Καφές', 'gala')).toEqual([{ text: 'Καφές', bold: false }]);
    expect(splitHighlight('Καφές', '  ')).toEqual([{ text: 'Καφές', bold: false }]);
  });

  it('handles a two-word query', () => {
    expect(join(splitHighlight('Nescafe Classic Gold', 'nescafe cl'))).toBe('[Nescafe Cl]assic Gold');
  });
});
