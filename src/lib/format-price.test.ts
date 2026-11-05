import { describe, it, expect } from 'vitest';
import { formatPrice, formatUnitPrice, formatNumberEl } from './format-price';

const N = ' ';
describe('formatPrice', () => {
  it('uses decimal comma and nbsp before €', () => {
    expect(formatPrice(0.83)).toBe(`0,83${N}€`);
    expect(formatPrice(3)).toBe(`3,00${N}€`);
    expect(formatPrice('2.5')).toBe(`2,50${N}€`);
  });
  it('groups thousands with a dot from 1.000', () => {
    expect(formatPrice(999.9)).toBe(`999,90${N}€`);
    expect(formatPrice(1000)).toBe(`1.000,00${N}€`);
    expect(formatPrice(1234567.891)).toBe(`1.234.567,89${N}€`);
  });
  it('handles negatives and empties', () => {
    expect(formatPrice(-1.5)).toBe(`-1,50${N}€`);
    expect(formatPrice(null)).toBe('');
    expect(formatPrice(undefined)).toBe('');
    expect(formatPrice(NaN)).toBe('');
  });
  it('formats unit prices', () => {
    expect(formatUnitPrice(0.834, 'λίτρο')).toBe(`0,83${N}€/λίτρο`);
    expect(formatUnitPrice(null, 'κιλό')).toBe('');
  });
  it('formatNumberEl has no currency', () => {
    expect(formatNumberEl(12.3)).toBe('12,30');
  });
});
