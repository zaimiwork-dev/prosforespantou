import { describe, expect, it } from 'vitest';
import { sameWordsAndSize } from './name-exact';

describe('sameWordsAndSize', () => {
  it('links the same words written differently', () => {
    expect(sameWordsAndSize('NESCAFÉ® CLASSIC ΣΤΙΓΜΙΑΙΟΣ ΚΑΦΕΣ 200g', 'Nescafe Classic Καφές Στιγμιαίος 200γρ.')).toBe(true);
    expect(sameWordsAndSize('Χρυσελιά Κλασικό Ελαιόλαδο 2lt', 'ΧΡΥΣΕΛΙΑ ΚΛΑΣΙΚΟ ΕΛΑΙΟΛΑΔΟ 2LT.')).toBe(true);
    expect(sameWordsAndSize('Colgate Max White One Οδοντόκρεμα 75ml', 'COLGATE Οδοντόκρεμα Max White One 75ml')).toBe(true);
  });

  it('does not link different sizes', () => {
    expect(sameWordsAndSize('Nescafe Classic Καφές Στιγμιαίος 200γρ.', 'Nescafe Classic Καφές Στιγμιαίος 100γρ.')).toBe(false);
  });

  it('does not link when one name has a word the other lacks', () => {
    expect(sameWordsAndSize('Nescafe Classic Decaf Στιγμιαίος 100g', 'Nescafe Classic Στιγμιαίος 100g')).toBe(false);
    expect(sameWordsAndSize('Nescafe Στιγμιαίος Καφές 200gr', 'Nescafe Classic Στιγμιαίος Καφές 200gr')).toBe(false);
  });

  it('needs a stated size on both sides and more than a brand', () => {
    expect(sameWordsAndSize('Lacta Σοκολάτα Γάλακτος 85gr', 'Lacta Σοκολάτα Γάλακτος')).toBe(false);
    expect(sameWordsAndSize('Lacta 85g', 'LACTA 85gr')).toBe(false);
    expect(sameWordsAndSize('', 'Lacta Σοκολάτα 85g')).toBe(false);
  });
});
