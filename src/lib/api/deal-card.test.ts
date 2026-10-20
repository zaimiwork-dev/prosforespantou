import { describe, it, expect } from 'vitest';
import { toDealCard, resolveImage, SITE_ORIGIN } from './deal-card';

const base = {
  id: 'd1',
  productId: 'p1',
  supermarket: 'masoutis',
  productName: 'Γάλα Φρέσκο ΔΕΛΤΑ 1lt',
  category: 'Γαλακτοκομικά',
  discountedPrice: 1.5,
  originalPrice: null,
  discountPercent: null,
  validFrom: new Date('2026-10-15T00:00:00Z'),
  validUntil: new Date('2026-10-29T00:00:00Z'),
  updatedAt: new Date('2026-10-20T03:00:00Z'),
  source: 'web',
};

describe('toDealCard', () => {
  it('splits name and size, and prices per litre like the shelf label', () => {
    const c = toDealCard(base);
    expect(c.name).toBe('Γάλα Φρέσκο ΔΕΛΤΑ 1lt');
    expect(c.size).not.toBeNull();
    expect(c.unit).toEqual({ per: 'λίτρο', value: 1.5 });
  });

  it('derives the percent from a published was-price when none is stored', () => {
    const c = toDealCard({ ...base, originalPrice: 2, discountedPrice: 1.5 });
    expect(c.percent).toBe(25);
    expect(c.originalPrice).toBe(2);
  });

  it('never shows a baseline next to a chain-published was-price', () => {
    const c = toDealCard({ ...base, originalPrice: 2, baselinePrice: 2.2, impliedPercent: 30 });
    expect(c.baseline).toBeNull();
  });

  it('shows the «κανονικά» baseline for a ΜΟΝΟ offer inside the band', () => {
    const c = toDealCard({ ...base, baselinePrice: 2, impliedPercent: 25, baselineAt: new Date('2026-10-10T00:00:00Z') });
    expect(c.baseline).toEqual({ price: 2, percent: 25, checkedAt: '2026-10-10T00:00:00.000Z' });
  });

  it('passes only positive verdicts', () => {
    expect(toDealCard({ ...base, priceVerdict: 'lowest' }).verdict).toBe('lowest');
    expect(toDealCard({ ...base, priceVerdict: 'good' }).verdict).toBe('good');
    expect(toDealCard({ ...base, priceVerdict: 'high' }).verdict).toBeNull();
    expect(toDealCard({ ...base, priceVerdict: null }).verdict).toBeNull();
  });

  it('counts the stores with a price shown, this one included', () => {
    expect(toDealCard(base).compareChains).toBe(1);
    expect(toDealCard({ ...base, comparisonCount: 3 }).compareChains).toBe(4);
  });

  it('hides the internal wolt collection label', () => {
    expect(toDealCard({ ...base, source: 'wolt' }).sources).toEqual([]);
    expect(toDealCard({ ...base, sources: ['web', 'leaflet', 'wolt'] }).sources).toEqual(['web', 'leaflet']);
  });

  it('sends dates as ISO strings and leaves expiry wording to the app', () => {
    const c = toDealCard(base);
    expect(c.validUntil).toBe('2026-10-29T00:00:00.000Z');
    expect(c).not.toHaveProperty('chip');
  });

  it('labels a sponsored slot and carries the weekly-essential tag', () => {
    const c = toDealCard({ ...base, isFeatured: true, essential: { id: 'milk', label: 'Γάλα', chainCount: 4 } });
    expect(c.featured).toEqual({ label: 'Χορηγούμενο' });
    expect(c.essential).toEqual({ id: 'milk', label: 'Γάλα', chainCount: 4 });
  });
});

describe('resolveImage', () => {
  it('prefers the offer image over the catalogue one', () => {
    expect(resolveImage({ imageUrl: 'https://a/x.webp', product: { imageUrl: 'https://b/y.webp' } })).toBe('https://a/x.webp');
    expect(resolveImage({ imageUrl: null, product: { imageUrl: 'https://b/y.webp' } })).toBe('https://b/y.webp');
  });

  it('makes site-relative and bare legacy names absolute', () => {
    expect(resolveImage({ imageUrl: '/placeholder.png' })).toBe(`${SITE_ORIGIN}/placeholder.png`);
    expect(resolveImage({ imageUrl: 'old/dir/123.jpg' })).toBe(`${SITE_ORIGIN}/wolt_images/123.jpg`);
  });

  it('returns null when there is no image at all', () => {
    expect(resolveImage({ imageUrl: null, product: null })).toBeNull();
  });
});
