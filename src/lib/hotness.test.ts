import { describe, it, expect } from 'vitest';
import { computeHotScore, CLICK_WEIGHT } from './hotness';

const base = { productName: 'Tuvunu Ανθρακούχο Κάτι 330ml', createdAt: new Date() };

describe('computeHotScore — popularity dampening', () => {
  it('a few stray clicks no longer catapult an item (log curve)', () => {
    // Old model: 4 clicks × 8 = +32 — enough to outrank every curated signal.
    const fourClicks = computeHotScore({ ...base, clicks: 4 }) - computeHotScore({ ...base, clicks: 0 });
    expect(fourClicks).toBeLessThan(20);
    expect(fourClicks).toBeGreaterThan(10); // still matters, just not dominant
  });

  it('diminishing returns: clicks 0→4 gains more than 21→25', () => {
    const early = computeHotScore({ ...base, clicks: 4 }) - computeHotScore({ ...base, clicks: 0 });
    const late = computeHotScore({ ...base, clicks: 25 }) - computeHotScore({ ...base, clicks: 21 });
    expect(early).toBeGreaterThan(late * 3);
  });

  it('a list_add is worth more than a click (stronger intent)', () => {
    const oneAdd = computeHotScore({ ...base, listAdds: 1 }) - computeHotScore(base);
    const oneClick = computeHotScore({ ...base, clicks: 1 }) - computeHotScore(base);
    expect(oneAdd).toBeGreaterThan(oneClick);
  });

  it('immediate per-click bump stays a nudge, not a rocket', () => {
    expect(CLICK_WEIGHT).toBeLessThanOrEqual(3);
  });
});

describe('computeHotScore — honest-pricing verdict', () => {
  it('a genuinely lowest-price offer outranks the same offer priced high', () => {
    const lowest = computeHotScore({ ...base, priceVerdict: 'lowest' });
    const high = computeHotScore({ ...base, priceVerdict: 'high' });
    expect(lowest - high).toBeGreaterThanOrEqual(14);
  });

  it('verdict can demote an over-priced KVI below a fairly-priced one', () => {
    // Both are milk (KVI tier 1) at -20%; the honest verdict decides.
    const fair = computeHotScore({ productName: 'Γάλα Α 1L', discountPercent: 20, priceVerdict: 'fair' });
    const high = computeHotScore({ productName: 'Γάλα Β 1L', discountPercent: 20, priceVerdict: 'high' });
    expect(fair).toBeGreaterThan(high);
  });

  it('unknown / null verdicts are neutral', () => {
    expect(computeHotScore({ ...base, priceVerdict: null })).toBe(computeHotScore(base));
    expect(computeHotScore({ ...base, priceVerdict: 'whatever' })).toBe(computeHotScore(base));
  });
});

describe('computeHotScore — stable tie-breaking jitter', () => {
  it('same key always produces the same score', () => {
    const a1 = computeHotScore({ ...base, jitterKey: 'row-a' });
    const a2 = computeHotScore({ ...base, jitterKey: 'row-a' });
    expect(a1).toBe(a2);
  });

  it('different keys break ties without changing the magnitude (< 1.2)', () => {
    const a = computeHotScore({ ...base, jitterKey: 'row-a' });
    const b = computeHotScore({ ...base, jitterKey: 'row-b' });
    expect(a).not.toBe(b);
    expect(Math.abs(a - b)).toBeLessThan(1.2);
  });

  it('jitter never reorders genuinely different scores', () => {
    // KVI tier-1 (10) vs nothing (0) — jitter (<1.2) must not bridge that gap.
    const kvi = computeHotScore({ productName: 'Καφές Φίλτρου', jitterKey: 'unlucky-low' });
    const plain = computeHotScore({ productName: 'Κάτι Αδιάφορο', jitterKey: 'lucky-high' });
    expect(kvi).toBeGreaterThan(plain);
  });
});
