import { describe, expect, it } from 'vitest';
import { groupSupermarketDealsByAisle, supermarketAisleKey } from './supermarket-aisles';

describe('supermarketAisleKey', () => {
  it('separates alcohol, soft drinks, and water from Κάβα', () => {
    expect(supermarketAisleKey({ category: 'Κάβα', productName: 'Νύμφη Μπίρα Lager 6x330ml' })).toBe('alcohol');
    expect(supermarketAisleKey({ category: 'Κάβα', productName: 'Fanta Πορτοκαλάδα Zero 6x330ml' })).toBe('soft-drinks');
    expect(supermarketAisleKey({ category: 'Κάβα', productName: 'Ζαγόρι Φυσικό Μεταλλικό Νερό 6x1,5L' })).toBe('water');
  });

  it('separates coffee, juices, and tea from breakfast products', () => {
    expect(supermarketAisleKey({ category: 'Πρωινό & Ροφήματα', productName: 'Nescafe Gold Καφές 95g' })).toBe('coffee');
    expect(supermarketAisleKey({ category: 'Πρωινό & Ροφήματα', productName: 'Amita Χυμός Πορτοκάλι 1L' })).toBe('juice');
    expect(supermarketAisleKey({ category: 'Πρωινό & Ροφήματα', productName: 'Lipton Πράσινο Τσάι 20 φακελάκια' })).toBe('tea');
    expect(supermarketAisleKey({ category: 'Πρωινό & Ροφήματα', productName: 'Kelloggs Δημητριακά 500g' })).toBe('breakfast');
  });
});

describe('groupSupermarketDealsByAisle', () => {
  it('uses a stable supermarket-department order while preserving deal order inside an aisle', () => {
    const groups = groupSupermarketDealsByAisle([
      { productName: 'Fanta', category: 'Κάβα', id: 'soft' },
      { productName: 'Μήλα', category: 'Φρούτα & Λαχανικά', id: 'fruit' },
      { productName: 'Coca Cola', category: 'Κάβα', id: 'soft-2' },
      { productName: 'Κρασί', category: 'Κάβα', id: 'wine' },
    ]);
    expect(groups.map((group) => group.key)).toEqual(['Φρούτα & Λαχανικά', 'alcohol', 'soft-drinks']);
    expect(groups[2].deals.map((deal) => deal.id)).toEqual(['soft', 'soft-2']);
  });
});
