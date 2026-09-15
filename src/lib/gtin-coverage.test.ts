import { describe, it, expect } from 'vitest';
import { evaluateGtinRate, formatGtinRate } from './gtin-coverage';

describe('evaluateGtinRate', () => {
  it('passes a healthy chain (Masoutis/AB measured at 97-100%)', () => {
    expect(evaluateGtinRate(3636, 3605, 0.5)).toBe('ok');
    expect(evaluateGtinRate(4149, 4149, 0.5)).toBe('ok');
  });

  it('catches the Sklavenitis collapse that stayed green for months', () => {
    expect(evaluateGtinRate(3516, 34, 0.5)).toBe('below-floor');
  });

  it('treats an empty scrape as unknown, not as a barcode regression', () => {
    // A failed scrape is a different alarm; blaming the barcode source would
    // send whoever reads it looking in the wrong place.
    expect(evaluateGtinRate(0, 0, 0.5)).toBe('unknown');
  });

  it('honours a deliberately disabled gate (floor 0)', () => {
    expect(evaluateGtinRate(3516, 34, 0)).toBe('ok');
  });

  it('is exclusive at the floor — exactly at the floor passes', () => {
    expect(evaluateGtinRate(100, 50, 0.5)).toBe('ok');
    expect(evaluateGtinRate(100, 49, 0.5)).toBe('below-floor');
  });

  it('does not throw on nonsense input', () => {
    expect(evaluateGtinRate(NaN, 5, 0.5)).toBe('unknown');
    expect(evaluateGtinRate(100, 50, NaN)).toBe('ok');
  });
});

describe('formatGtinRate', () => {
  it('formats a percentage to one decimal', () => {
    expect(formatGtinRate(3516, 34)).toBe('1.0%');
    expect(formatGtinRate(4149, 4149)).toBe('100.0%');
  });
  it('says n/a rather than dividing by zero', () => {
    expect(formatGtinRate(0, 0)).toBe('n/a');
  });
});
