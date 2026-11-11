import { describe, expect, it } from 'vitest';
import { formatPrice, formatUnitPrice } from './format';

describe('formatPrice', () => {
  it('uses a decimal comma, two decimals and a spaced euro sign', () => {
    expect(formatPrice(1.5)).toBe('1,50 €');
    expect(formatPrice(0.83)).toBe('0,83 €');
    expect(formatPrice(12)).toBe('12,00 €');
  });

  it('groups thousands with a dot, including four-digit numbers', () => {
    expect(formatPrice(1234.5)).toBe('1.234,50 €');
    expect(formatPrice(1000000)).toBe('1.000.000,00 €');
  });

  it('prints a unit price like the shelf label', () => {
    expect(formatUnitPrice({ value: 0.83, per: 'λίτρο' })).toBe('0,83 €/λίτρο');
  });
});
