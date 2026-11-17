import { describe, it, expect } from 'vitest';
import { parsePack, perUnitPrice, splitNameAndSize, unitPrice } from './pack-info';

// €/κιλό-€/λίτρο — the shelf-label number. Names are real DB rows.
describe('unitPrice', () => {
  it('plain weights → €/κιλό', () => {
    expect(unitPrice('Lavazza Qualita Rossa Καφές Espresso Αλεσμένος 250γρ.', 6.05))
      .toEqual({ per: 'κιλό', value: 24.2 });
    expect(unitPrice('ΣΚΛΗΡΟ ΤΥΡΙ ΚΕΦΑΛΟΤΥΡΙ 400gr', 4.0)).toEqual({ per: 'κιλό', value: 10 });
  });

  it('multipack sizes multiply (6x400g = 2.4kg)', () => {
    expect(unitPrice('ΝΟΥΝΟΥ Kid Ρόφημα Γάλακτος Συμπυκνωμένο 6x400g', 6.15))
      .toEqual({ per: 'κιλό', value: 2.56 });
  });

  it('volumes → €/λίτρο, with decimal commas', () => {
    expect(unitPrice('ΔΕΛΤΑ μμμMilk Γάλα Υψηλής Παστερίωσης Ελαφρύ 1,5lt', 1.61))
      .toEqual({ per: 'λίτρο', value: 1.07 });
    expect(unitPrice('PALMOLIVE Plus Απορρυπαντικό Πιάτων Υγρό 750ml', 1.64))
      .toEqual({ per: 'λίτρο', value: 2.19 });
  });

  it('gift multibuys multiply a per-piece size ((9+3)×330ml = 3.96L)', () => {
    expect(unitPrice('Βεργίνα Μπίρα Κουτί 330ml (9+3 Δώρο)', 8.42))
      .toEqual({ per: 'λίτρο', value: 2.13 });
  });

  it('laundry doses beat volume (concentrates lie per-liter)', () => {
    expect(unitPrice('SKIP ΥΓΡΟ ΠΛΥΝΤ. ACTIVE CLEAN 70ΜΕΖ 3,5lt', 10.89))
      .toEqual({ per: 'μεζούρα', value: 0.16 });
  });

  it('diaper weight ranges are NOT pack sizes; falls to €/τεμ', () => {
    expect(unitPrice('Pampers Premium Care Πάνες Νο4 (9-14kg.) Jumbo Pack 52τεμ.', 13.49))
      .toEqual({ per: 'τεμ.', value: 0.26 });
  });

  it('sold-by-the-kilo names return the price as €/κιλό', () => {
    expect(unitPrice('ΓΚΟΥΝΤΑ ΦΡΑΤΖΟΛΑ ΓΕΡΜΑΝΙΑΣ ΤΟ ΚΙΛΟ', 8.9)).toEqual({ per: 'κιλό', value: 8.9 });
  });

  it('no quantity in the name → null', () => {
    expect(unitPrice('Μπύρα Fix Hellas Κουτί', 1.2)).toBeNull();
    expect(unitPrice(null, 1.2)).toBeNull();
  });

  it('tiny quantities are not nonsense (20x2γρ tea = 40g still honest)', () => {
    expect(unitPrice('Loyd Τσάι Αρωματικό Σε Πυραμίδες 20x2γρ.', 2.0))
      .toEqual({ per: 'κιλό', value: 50 });
  });
});

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

// The card prints the size on its own line; the title must not keep a piece of it.
describe('splitNameAndSize', () => {
  it('peels a trailing size off the name', () => {
    expect(splitNameAndSize('ΔΕΛΤΑ Γάλα Φρέσκο Πλήρες 1lt')).toEqual({ title: 'ΔΕΛΤΑ Γάλα Φρέσκο Πλήρες', size: '1lt' });
    expect(splitNameAndSize('ΝΟΥΝΟΥ Kid Ρόφημα Γάλακτος Συμπυκνωμένο 6x400g')).toEqual({ title: 'ΝΟΥΝΟΥ Kid Ρόφημα Γάλακτος Συμπυκνωμένο', size: '6x400g' });
    expect(splitNameAndSize('Lurpak Βούτυρο Ανάλατο 225γρ.')).toEqual({ title: 'Lurpak Βούτυρο Ανάλατο', size: '225γρ' });
  });

  it('keeps weight and volume together when a name gives both (ice cream)', () => {
    expect(splitNameAndSize('ΕΠΙΛΟΓΗ ΜΟΥ ΠΑΓΩΤΟ ΞΥΛ ΒΑΝ.ΕΠΙΚ ΣΟΚ ΥΓΕΙΑΣ 3*80ΓΡ/110ML')).toEqual({
      title: 'ΕΠΙΛΟΓΗ ΜΟΥ ΠΑΓΩΤΟ ΞΥΛ ΒΑΝ.ΕΠΙΚ ΣΟΚ ΥΓΕΙΑΣ',
      size: '3*80ΓΡ/110ML',
    });
    expect(splitNameAndSize('Κρι Κρι Παγωτό Βανίλια 1,5kg / 3lt')).toEqual({ title: 'Κρι Κρι Παγωτό Βανίλια', size: '1,5kg/3lt' });
  });

  it('leaves the name whole when there is no size, a one-word title, or a weight range', () => {
    expect(splitNameAndSize('Αυγά Φρέσκα Μεσαία')).toEqual({ title: 'Αυγά Φρέσκα Μεσαία', size: null });
    expect(splitNameAndSize('Γάλα 1lt')).toEqual({ title: 'Γάλα 1lt', size: null });
    expect(splitNameAndSize('Pampers Πάνες Νο4 (9-14kg)').size).toBeNull();
    expect(splitNameAndSize(null)).toEqual({ title: '', size: null });
  });
});
