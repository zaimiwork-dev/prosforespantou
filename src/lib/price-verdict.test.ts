import { describe, it, expect } from 'vitest';
import { computeVerdict, isPositiveVerdict } from './price-verdict';

describe('computeVerdict', () => {
  it('returns null verdict with no history', () => {
    expect(computeVerdict(5, []).verdict).toBeNull();
    expect(computeVerdict(null, [1, 2, 3]).verdict).toBeNull();
  });

  it('marks "lowest" when current is at or below the recorded low', () => {
    const r = computeVerdict(6.99, [7.42, 7.2, 6.99, 7.1]);
    expect(r.verdict).toBe('lowest');
    expect(r.min).toBe(6.99);
    expect(r.percentAboveMin).toBe(0);
  });

  it('does NOT mark "lowest" when current is above the series (the 7.73€ bug)', () => {
    // Cross-chain history low 6.99, but THIS offer is 7.73 — must not be "lowest".
    const r = computeVerdict(7.73, [6.99, 7.2, 7.42]);
    expect(r.verdict).not.toBe('lowest');
    expect(isPositiveVerdict(r.verdict)).toBe(false); // stays silent, never lies
    expect(r.percentAboveMin).toBeGreaterThan(5);
  });

  it('marks "good" within 5% of the low', () => {
    const r = computeVerdict(7.2, [6.99, 7.5, 8.0]); // 3% over min
    expect(r.verdict).toBe('good');
    expect(isPositiveVerdict(r.verdict)).toBe(true);
  });

  it('marks "high" clearly above average (no badge surfaced)', () => {
    const r = computeVerdict(10, [6, 6.5, 7]);
    expect(r.verdict).toBe('high');
    expect(isPositiveVerdict(r.verdict)).toBe(false);
  });

  it('ignores non-positive / non-finite prices', () => {
    const r = computeVerdict(5, [0, -1, NaN, 5, 6, 5.5]);
    expect(r.min).toBe(5);
    expect(r.verdict).toBe('lowest');
  });

  it('gives no verdict with fewer than 3 points (young-data honesty)', () => {
    const r = computeVerdict(5, [5, 6]);
    expect(r.verdict).toBeNull();
    expect(r.min).toBe(5); // stats still returned for the factual line
  });

  it('gives no verdict on a flat history (never a "deal")', () => {
    const r = computeVerdict(5, [5, 5, 5]);
    expect(r.verdict).toBeNull();
  });

  it('isPositiveVerdict only true for lowest/good', () => {
    expect(isPositiveVerdict('lowest')).toBe(true);
    expect(isPositiveVerdict('good')).toBe(true);
    expect(isPositiveVerdict('fair')).toBe(false);
    expect(isPositiveVerdict('meh')).toBe(false);
    expect(isPositiveVerdict('high')).toBe(false);
    expect(isPositiveVerdict(null)).toBe(false);
  });
});
