import { describe, it, expect } from 'vitest';
import { expandSearch, rankSearchResults } from './search-rank';

// Real rows from the live DB — searching "γάλα" used to return the lotion and
// the soaps before any milk (substring match + expiry ordering).
const milk = { productName: 'ΝΟΥΝΟΥ Γάλα Συμπυκνωμένο Ελαφρύ 400g', category: 'Γαλακτοκομικά & Είδη Ψυγείου', hotScore: 24 };
const lotion = { productName: 'Agnotis Βρεφικό Γαλάκτωμα Σώματος 200ml.', category: 'Βρεφικά Είδη', hotScore: 10 };
const soap = { productName: 'Palmolive Naturals Κρεμοσάπουνο Μέλι & Γάλα 750ml', category: 'Προσωπική Φροντίδα', hotScore: 12 };
const chocolate = { productName: 'ΙΟΝ ΣΟΚΟΛΑΤΑ ΓΑΛΑΚΤΟΣ 70ΓΡ', category: 'Σνακ & Γλυκά', hotScore: 27 };
const large = { productName: 'Μεγάλα πιάτα χάρτινα 50 τεμ.', category: 'Είδη Καθαρισμού & Σπιτιού', hotScore: 40 };

describe('rankSearchResults — the γάλα test', () => {
  it('actual milk outranks lotions, soaps and chocolate', () => {
    const ranked = rankSearchResults('γάλα', [lotion, soap, chocolate, milk]);
    expect(ranked[0]).toBe(milk);
  });

  it('soap with the word in its scent name still ranks below dairy', () => {
    const ranked = rankSearchResults('γάλα', [soap, milk]);
    expect(ranked[0]).toBe(milk);
  });

  it('accent-insensitive: "γαλα" behaves the same', () => {
    const ranked = rankSearchResults('γαλα', [lotion, soap, milk]);
    expect(ranked[0]).toBe(milk);
  });

  it('greeklish "gala" finds the Greek rows', () => {
    const ranked = rankSearchResults('gala', [lotion, soap, milk]);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]).toBe(milk);
  });

  it('does not treat short hidden substrings as matches', () => {
    expect(rankSearchResults('gala', [large])).toHaveLength(0);
  });
});

describe('rankSearchResults — general behaviour', () => {
  it('name matches beat description-only matches', () => {
    const inName = { productName: 'Lavazza Καφές Espresso', category: 'Πρωινό & Ροφήματα', hotScore: 0 };
    const inDesc = { productName: 'Κούπα Κεραμική', description: 'ιδανική για καφέ', category: 'Άλλο', hotScore: 50 };
    const ranked = rankSearchResults('καφές', [inDesc, inName]);
    expect(ranked[0]).toBe(inName);
  });

  it('non-matching rows are excluded entirely', () => {
    const ranked = rankSearchResults('καφές', [milk, soap]);
    expect(ranked).toHaveLength(0);
  });

  it('popularity only breaks ties, never overrides relevance', () => {
    const exact = { productName: 'Καφές Φίλτρου 500g', category: 'Πρωινό & Ροφήματα', hotScore: 0 };
    const partial = { productName: 'Καφετιέρα Espresso', category: 'Άλλο', hotScore: 60 };
    const ranked = rankSearchResults('καφές', [partial, exact]);
    expect(ranked[0]).toBe(exact);
  });

  it('short/empty queries return nothing', () => {
    expect(rankSearchResults('', [milk])).toHaveLength(0);
  });
});

describe('expandSearch', () => {
  it('expands greeklish to Greek', () => {
    expect(expandSearch('gala')).toContain('γαλα');
  });
  it('expands brand synonyms', () => {
    expect(expandSearch('pampers')).toContain('παμπερς');
  });
});
