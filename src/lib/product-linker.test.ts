import { describe, it, expect } from 'vitest';
import { compareSizes, foldText, parseName, parseSize, phoneticKey, scoreLink } from './product-linker';

// Proposals are made with this context (link-products-offline.mjs).
const ctx = { requireSameSize: true };
const link = (a: string, b: string) => scoreLink({ name: a }, { name: b }, ctx);
const size = (text: string) => parseSize(foldText(text));

describe('text normalisation', () => {
  it('reads «Χ.» as «χωρίς» only when it is that abbreviation', () => {
    expect(foldText('Γιαούρτι Χ.Λακτόζη')).toBe('γιαουρτι χωρις λακτοζη');
    // The first version of this rule had lost its backslashes and turned every
    // name starting with Χ into «χωρις …» (χαρτί, χυμός, χαλβάς).
    expect(foldText('Χαρτί Υγείας')).toBe('χαρτι υγειασ');
    expect(foldText('Χυμός Πορτοκάλι')).toBe('χυμοσ πορτοκαλι');
  });

  it('gives a brand the same key in Greek and Latin letters', () => {
    expect(phoneticKey('δελτα')).toBe(phoneticKey('delta'));
    expect(phoneticKey('νεσκαφε')).toBe(phoneticKey('nescafe'));
    expect(phoneticKey('μινι')).toBe(phoneticKey('mini'));
  });

  it('takes the first word as the brand', () => {
    expect(parseName('ΔΕΛΤΑ Γάλα 1lt').brand).toBe('delta');
  });
});

describe('sizes and packs', () => {
  it('reads multipacks, gift packs and piece counts', () => {
    expect(size('Coca-Cola 6x330ml').sizes[0]).toMatchObject({ dim: 'ml', unit: 330, count: 6, total: 1980 });
    expect(size('Tuborg Σόδα Κουτί 330ml 5+1 Δώρο').sizes[0]).toMatchObject({ unit: 330, count: 6, total: 1980 });
    expect(size('Χαρτί 4x12τεμ').pieces).toBe(48);
    expect(size('Fairy Caps 30τεμ.').pieces).toBe(30);
  });

  it('treats the same quantity in other units or another pack notation as the same', () => {
    expect(compareSizes(size('1,5lt'), size('1500ml'))).toBe('same');
    expect(compareSizes(size('6x330ml'), size('330ml 5+1 δωρο'))).toBe('same');
    expect(compareSizes(size('400ml'), size('900ml'))).toBe('conflict');
    expect(compareSizes(size('6x330ml'), size('330ml'))).toBe('conflict');
  });
});

describe('links it should make', () => {
  it('links the same item across chains despite case, script and word order', () => {
    expect(link('Lurpak Βούτυρο Ανάλατο 225γρ.', 'LURPAK Βούτυρο Ανάλατο 225g')).toMatchObject({ veto: null, score: 1 });
    expect(link('ΔΕΛΤΑ Γάλα Φρέσκο Πλήρες 1lt', 'Delta Φρέσκο Γάλα Πλήρες 1L')).toMatchObject({ veto: null, score: 1 });
  });

  it('accepts a brand written as one word or two', () => {
    const r = link('Every Day Hyperdry Σερβιέτες Maxi Night Ultra Plus 18τεμ.', 'EVERYDAY Hyperdry Σερβιέτες Ultra Plus Maxi Night 18τεμ');
    expect(r.veto).toBeNull();
    expect(r.score).toBe(1);
  });

  it('does not let a modifier spelled in the other alphabet, or «baby» inside a brand, block a link', () => {
    expect(link('Το Μάννα Μίνι Παξιμάδια Με Λιναρόσπορο 230γρ.', 'Μάννα Παξιμάδι Με Λιναρόσπορο Mini 230gr').veto).toBeNull();
    expect(link('BABY CARE Μωρομάντηλα Χαμομήλι 3x72 Τεμάχια', 'BABYCARE Μωρομάντιλα Χαμομήλι 3x72τεμ').veto).toBeNull();
  });
});

// Each of these was a wrong proposal found by reading 300 proposals by hand
// (2026-11-13/15); the veto named is the rule that now stops it.
describe('links it must refuse', () => {
  it('two brands that share a word («Royal Sugar» / «Sugartia»)', () => {
    expect(link('Royal Sugar Ζάχαρη Λευκή Κρυσταλλική 1kg', 'SUGARTIA Ζάχαρη Λευκή Κρυσταλλική 1kg').veto).toBe('brand');
  });

  it('a variant word on one side only («Super Plus» / «Super», «Men+Care» / the women’s)', () => {
    expect(link('Tampax Ταμπόν Compak Pearl Super Plus 16τμχ', 'Tampax Compak Pearl Super Ταμπόν 16τεμ').veto).toBe('modifier');
    expect(link('DOVE Αποσμητικό Roll On Advanced Care Invisible Dry 50ml', 'Dove Men+ Care Αποσμητικό Roll-On Advanced Invisible Dry 50ml.').veto).toBe('modifier');
  });

  it('a multipack against a single item', () => {
    expect(link("McVitie's Μπισκότα Tartlets Λεμόνι 100gr 3τεμ", 'MCVITIES ΜΠΙΣΚΟΤΑ TARTLETS ΛΕΜΟΝΙ 100ΓΡ').veto).toBe('pieces-one-side');
    expect(link('Coca-Cola Zero 6x330ml', 'Coca-Cola Zero 330ml').veto).toBe('size');
  });

  it('a name that states no size («- Μέλι ανθέων»)', () => {
    expect(link('Μέλι Ανθέων 500g', '- Μέλι ανθέων').veto).toBe('size-unstated');
    // without the proposal context silence is only a penalty, not a veto
    expect(scoreLink({ name: 'Μέλι Ανθέων 500g' }, { name: 'Μέλι ανθέων' }).veto).toBeNull();
  });

  it('a can against a bottle when both names say which', () => {
    expect(link('HEINEKEN Μπύρα Lager Κουτί 330ml', 'Heineken Μπίρα Lager Φιάλη 330ml').veto).toBe('container');
  });

  it('a different size or a decaf', () => {
    expect(link('Fairy Υγρό Πιάτων 400ml', 'Fairy Υγρό Πιάτων 900ml').veto).toBe('size');
    expect(link('Nescafe Classic Στιγμιαίος Καφές 200gr', 'Nescafe Classic Decaf Στιγμιαίος Καφές 200gr').veto).toBe('variant');
  });

  it('short look-alike words («cool» / «cola») no longer count as the same word', () => {
    const r = link('Halls Καραμέλες Cool Original 32gr', 'HALLS ΚΑΡΑΜΕΛΕΣ COLA Χ/Ζ 32ΓΡ');
    expect(r.veto !== null || r.score < 0.9).toBe(true);
  });
});
