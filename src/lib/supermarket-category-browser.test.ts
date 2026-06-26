import { describe, expect, it } from 'vitest';
import {
  buildSupermarketCategoryTree,
  supermarketBrowsePath,
  supermarketBrowsePathMatches,
} from './supermarket-category-browser';

describe('supermarketBrowsePath', () => {
  it('creates the drinks hierarchy used by the visual browser', () => {
    expect(supermarketBrowsePath({ category: 'Κάβα', productName: 'Νύμφη Μπίρα Lager' }))
      .toEqual({ topKey: 'drinks', groupKey: 'alcohol', leafKey: 'beer' });
    expect(supermarketBrowsePath({ category: 'Κάβα', productName: 'Κρασί Αγιωργίτικο' }))
      .toEqual({ topKey: 'drinks', groupKey: 'alcohol', leafKey: 'wine' });
    expect(supermarketBrowsePath({ category: 'Κάβα', productName: 'Coca Cola Zero' }))
      .toEqual({ topKey: 'drinks', groupKey: 'soft-drinks' });
    expect(supermarketBrowsePath({ category: 'Πρωινό & Ροφήματα', productName: 'Nescafe Espresso' }))
      .toEqual({ topKey: 'drinks', groupKey: 'coffee', leafKey: 'espresso' });
  });

  it('keeps breakfast food separate from coffee and juices', () => {
    expect(supermarketBrowsePath({ category: 'Πρωινό & Ροφήματα', productName: 'Kelloggs Δημητριακά' }))
      .toEqual({ topKey: 'food', groupKey: 'breakfast' });
  });

  it('uses native subcategory text to split care and household departments', () => {
    expect(supermarketBrowsePath({
      category: 'Προσωπική Φροντίδα',
      subcategory: 'Σαμπουάν',
      productName: 'Elvive',
    }).groupKey).toBe('hair');
    expect(supermarketBrowsePath({
      category: 'Είδη Καθαρισμού & Σπιτιού',
      subcategory: 'Απορρυπαντικά Ρούχων',
      productName: 'Ariel',
    }).groupKey).toBe('laundry');
  });
});

describe('buildSupermarketCategoryTree', () => {
  it('returns stable top-level counts and nested leaf counts', () => {
    const tree = buildSupermarketCategoryTree([
      { category: 'Κάβα', productName: 'Μπίρα Lager' },
      { category: 'Κάβα', productName: 'Κρασί Merlot' },
      { category: 'Σνακ & Γλυκά', productName: 'Πατατάκια' },
    ]);
    expect(tree.map((node) => node.key)).toEqual(['food', 'drinks']);
    expect(tree[1].count).toBe(2);
    expect(tree[1].children[0].children.map((node) => [node.key, node.count]))
      .toEqual([['beer', 1], ['wine', 1]]);
  });

  it('matches either a whole group or a selected leaf', () => {
    const wine = { category: 'Κάβα', productName: 'Κρασί Merlot' };
    expect(supermarketBrowsePathMatches(wine, { topKey: 'drinks', groupKey: 'alcohol' })).toBe(true);
    expect(supermarketBrowsePathMatches(wine, { topKey: 'drinks', groupKey: 'alcohol', leafKey: 'beer' })).toBe(false);
  });
});
