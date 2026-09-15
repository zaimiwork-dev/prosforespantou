import { describe, it, expect } from 'vitest';
import { splitNameAndSize } from './pack-info';

// Real DB names. The card prints `title` (2-line clamp) and `size` on its own line.
describe('splitNameAndSize', () => {
  it('peels a trailing weight/volume off the name', () => {
    expect(splitNameAndSize('Misko Ζυμαρικά Πενάκι 500gr')).toEqual({ title: 'Misko Ζυμαρικά Πενάκι', size: '500gr' });
    expect(splitNameAndSize('ΔΕΛΤΑ μμμMilk Οικογενειακό Γάλα 3,5% 1,5lt')).toEqual({
      title: 'ΔΕΛΤΑ μμμMilk Οικογενειακό Γάλα 3,5%',
      size: '1,5lt',
    });
    expect(splitNameAndSize('Lavazza Qualita Rossa Καφές Espresso Αλεσμένος 250γρ.')).toEqual({
      title: 'Lavazza Qualita Rossa Καφές Espresso Αλεσμένος',
      size: '250γρ',
    });
  });

  it('handles multipacks and parenthesised sizes', () => {
    expect(splitNameAndSize('ΝΟΥΝΟΥ Kid Ρόφημα Γάλακτος Συμπυκνωμένο 6x400g')).toEqual({
      title: 'ΝΟΥΝΟΥ Kid Ρόφημα Γάλακτος Συμπυκνωμένο',
      size: '6x400g',
    });
    expect(splitNameAndSize('Le Petit Marseillais Αφρόλουτρο Sensitive (650ml)')).toEqual({
      title: 'Le Petit Marseillais Αφρόλουτρο Sensitive',
      size: '650ml',
    });
  });

  it('leaves names alone when the size is not the last token', () => {
    const n = 'COCA-COLA Original Taste 8x330ml τα 500ml Δώρο';
    expect(splitNameAndSize(n)).toEqual({ title: n, size: null });
    const g = 'Βεργίνα Μπίρα Κουτί 330ml (9+3 Δώρο)';
    expect(splitNameAndSize(g)).toEqual({ title: g, size: null });
  });

  it('never treats a diaper weight range as a size', () => {
    const n = 'Pampers Premium Care Πάνες Νο4 (9-14kg)';
    expect(splitNameAndSize(n)).toEqual({ title: n, size: null });
  });

  it('keeps one-word titles whole and tolerates empty input', () => {
    expect(splitNameAndSize('Γάλα 1lt')).toEqual({ title: 'Γάλα 1lt', size: null });
    expect(splitNameAndSize('')).toEqual({ title: '', size: null });
    expect(splitNameAndSize(null)).toEqual({ title: '', size: null });
  });
});
