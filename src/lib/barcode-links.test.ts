import { describe, expect, it } from 'vitest';
import { attachByName, barcodePairs, normalizeItemName, MAX_ITEMS_PER_BARCODE_PER_STORE } from './barcode-links';

describe('normalizeItemName', () => {
  it('ignores case, accents, punctuation and unit spellings', () => {
    expect(normalizeItemName('ΤΟΣΤΑΚΙ Λουκάνικα Ριγανάτα 320γρ.')).toBe(normalizeItemName('Tostaki λουκανικα ριγανατα 320 gr'.replace('Tostaki', 'τοστακι')));
    expect(normalizeItemName('Άλτις Ελαιόλαδο 1lt')).toBe(normalizeItemName('ΑΛΤΙΣ ελαιολαδο 1 L'));
    expect(normalizeItemName('Γάλα 1,5% 1λτ')).toBe('γαλα 1_5 1l');
    expect(normalizeItemName('Σαπούνι 4 τεμ.')).toBe(normalizeItemName('σαπουνι 4τεμαχια'));
  });
  it('keeps what tells products apart', () => {
    expect(normalizeItemName('Γάλα 1lt')).not.toBe(normalizeItemName('Γάλα 2lt'));
    expect(normalizeItemName('Lacta 85g')).not.toBe(normalizeItemName('Lacta Φουντούκι 85g'));
  });
});

describe('attachByName', () => {
  const items = [
    { chain: 'masoutis', code: 'm1', name: 'Φρεσκούλης Σαλάτα Μεσογειακή 150γρ.' },
    { chain: 'masoutis', code: 'm2', name: 'Lacta 85g' },
    { chain: 'masoutis', code: 'm3', name: 'Lacta 85g' }, // two items share the name
    { chain: 'ab', code: 'a1', name: 'Φρεσκούλης Σαλάτα Μεσογειακή 150g' },
  ];
  it('attaches on an exact name within the same store only', () => {
    const got = attachByName([
      { id: 'w1', chain: 'masoutis', name: 'ΦΡΕΣΚΟΥΛΗΣ Σαλάτα Μεσογειακή 150 gr', barcode: '5201', chainItemcode: null },
    ], items);
    expect([...got]).toEqual([['w1', 'm1']]);
  });
  it('skips names two store items share, and names that carry two barcodes', () => {
    const got = attachByName([
      { id: 'w2', chain: 'masoutis', name: 'Lacta 85γρ', barcode: '111', chainItemcode: null },
      { id: 'w3', chain: 'ab', name: 'Φρεσκούλης Σαλάτα Μεσογειακή 150g', barcode: '222', chainItemcode: null },
      { id: 'w4', chain: 'ab', name: 'Φρεσκούλης Σαλάτα Μεσογειακή 150 γρ', barcode: '333', chainItemcode: null },
    ], items);
    expect(got.size).toBe(0);
  });
  it('leaves listings that already know their item code alone, and never crosses stores', () => {
    const got = attachByName([
      { id: 'b1', chain: 'masoutis', name: 'Lacta 85g', barcode: '1', chainItemcode: 'm2' },
      { id: 'w5', chain: 'lidl', name: 'Φρεσκούλης Σαλάτα Μεσογειακή 150g', barcode: '5', chainItemcode: null },
    ], items);
    expect(got.size).toBe(0);
  });
});

describe('barcodePairs', () => {
  const it_ = (chain: string, code: string) => ({ chain, code, name: `${chain} ${code}` });
  it('pairs items of different stores sharing a barcode, once each', () => {
    const pairs = barcodePairs([
      { item: it_('ab', 'a1'), barcode: 'G1' },
      { item: it_('masoutis', 'm1'), barcode: 'G1' },
      { item: it_('bazaar', 'b1'), barcode: 'G1' },
      { item: it_('ab', 'a1'), barcode: 'G1' }, // same item seen twice
      { item: it_('ab', 'a2'), barcode: 'G2' }, // alone
    ]);
    expect(pairs.map((p) => `${p.a.chain}-${p.b.chain}:${p.barcode}`).sort()).toEqual(['ab-bazaar:G1', 'ab-masoutis:G1', 'masoutis-bazaar:G1'].sort());
  });
  it('never pairs within a store, and ignores a barcode spread over too many items of one store', () => {
    const many = Array.from({ length: MAX_ITEMS_PER_BARCODE_PER_STORE + 1 }, (_, i) => ({ item: it_('ab', `x${i}`), barcode: 'BAD' }));
    expect(barcodePairs([...many, { item: it_('lidl', 'l1'), barcode: 'BAD' }])).toEqual([]);
    expect(barcodePairs([{ item: it_('ab', 'a1'), barcode: 'G' }, { item: it_('ab', 'a2'), barcode: 'G' }])).toEqual([]);
  });
});
