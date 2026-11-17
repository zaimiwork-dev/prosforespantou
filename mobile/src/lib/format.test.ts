import { describe, expect, it } from 'vitest';
import { formatPrice, formatUnitPrice } from './format';

// The space before € is a no-break space (U+00A0), written out so it is visible.
const NBSP = ' ';

describe('formatPrice', () => {
  it('uses a decimal comma, two decimals and a spaced euro sign', () => {
    expect(formatPrice(1.5)).toBe(`1,50${NBSP}€`);
    expect(formatPrice(0.83)).toBe(`0,83${NBSP}€`);
    expect(formatPrice(12)).toBe(`12,00${NBSP}€`);
  });

  it('never lets the euro sign wrap onto its own line', () => {
    expect(formatPrice(1.5)).not.toContain(' ');
    expect(formatPrice(1.5).charCodeAt(4)).toBe(0x00a0);
  });

  it('groups thousands with a dot, including four-digit numbers', () => {
    expect(formatPrice(1234.5)).toBe(`1.234,50${NBSP}€`);
    expect(formatPrice(1000000)).toBe(`1.000.000,00${NBSP}€`);
  });

  it('prints a unit price like the shelf label', () => {
    expect(formatUnitPrice({ value: 0.83, per: 'λίτρο' })).toBe(`0,83${NBSP}€/λίτρο`);
  });
});
