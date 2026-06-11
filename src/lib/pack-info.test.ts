import { describe, it, expect } from 'vitest';
import { parsePack, perUnitPrice } from './pack-info';

// Names are real rows from the live DB.
describe('parsePack', () => {
  it('N+M Δώρο multibuys (the Βεργίνα case — photo shows 1 can, price buys 12)', () => {
    expect(parsePack('Βεργίνα Μπίρα Κουτί 330ml (9+3 Δώρο)')).toEqual({ units: 12, via: 'gift' });
    expect(parsePack('COCA COLA ΚΟΥΤΙ 330ML(5+1)Δ')).toEqual({ units: 6, via: 'gift' });
  });

  it('gift wording wins over the multipack factor when both appear', () => {
    // 6-pack where the promo is "5+1 δώρο" — both say 6; gift is the parse source
    expect(parsePack('ΜΠΥΡΑ ΝΥΜΦΗ ΚΟΥΤΙ LAGER 6*330ML (5+1)ΔΩΡΟ')).toEqual({ units: 6, via: 'gift' });
  });

  it('NxSize multipacks', () => {
    expect(parsePack('ΗΒΗ Go Χυμός 4 Φρούτων 6x250ml')).toEqual({ units: 6, via: 'multipack' });
    expect(parsePack('Μινέρβα Χωριό Τοματοχυμός 2x500γρ.')).toEqual({ units: 2, via: 'multipack' });
    expect(parsePack('Μπισκότα Βρώμης Crunchy Dipped Σοκολάτα Γάλακτος 8x20g')).toEqual({ units: 8, via: 'multipack' });
    expect(parsePack('Loyd Τσάι Αρωματικό Φρούτα Του Δάσους Σε Πυραμίδες 20x2γρ.')).toEqual({ units: 20, via: 'multipack' });
  });

  it('piece counts (τεμ / ρολά)', () => {
    expect(parsePack('Pampers Premium Care Πάνες Νο4 (9-14kg.) Jumbo Pack 52τεμ.')).toEqual({ units: 52, via: 'count' });
    expect(parsePack('My Home Ποτήρι Νερού Αναψυκτικού Διαφανές 270ml 50 Τεμάχια')).toEqual({ units: 50, via: 'count' });
    expect(parsePack('SOFTEX Χαρτί Υγείας 12 ρολά')).toEqual({ units: 12, via: 'count' });
  });

  it('single items and weight ranges parse as null (no false positives)', () => {
    expect(parsePack('Μεβγάλ Γάλα Protein Μπανάνα 330ml')).toBeNull();
    expect(parsePack('Lavazza Qualita Rossa Καφές Espresso Αλεσμένος 250γρ.')).toBeNull();
    // "(9-14kg)" must not read as 9+14
    expect(parsePack('Πάνες Βρακάκι Nο5 (11-16kg.) Jumbo')).toBeNull();
    expect(parsePack(null)).toBeNull();
  });
});

describe('perUnitPrice', () => {
  it('divides and formats', () => {
    expect(perUnitPrice(8.42, 12)).toBe('0.70');
    expect(perUnitPrice(13.49, 52)).toBe('0.26');
  });
  it('rejects missing price or single unit', () => {
    expect(perUnitPrice(null, 12)).toBeNull();
    expect(perUnitPrice(8.42, 1)).toBeNull();
  });
});
