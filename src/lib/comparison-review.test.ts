import { describe, expect, it } from 'vitest';
import { buildReviewRows, parseReason, type ReviewOffer, type ReviewVerdictRow } from './comparison-review';

const offer = (id: string, supermarket: string, productName: string, hotScore = 1, price = 2): ReviewOffer =>
  ({ id, supermarket, productName, discountedPrice: price, imageUrl: `https://img/${id}.jpg`, hotScore });

const verdict = (pairKey: string, a: [string, string], b: [string, string], v: string, model = 'claude-sonnet-5-5', reason: string | null = null): ReviewVerdictRow =>
  ({ pairKey, chainA: a[0], nameA: a[1], chainB: b[0], nameB: b[1], verdict: v, model, reason, createdAt: '2026-11-22T12:00:00Z' });

const OFFERS = [
  offer('o1', 'sklavenitis', 'SOFTEX Silk Χαρτί Υγείας 8τεμ 760g', 5),
  offer('o2', 'mymarket', 'Softex Silk Χαρτί Υγείας 8άρι 0,760kg', 3),
  offer('o3', 'masoutis', 'Palmolive Exotic Orchid 750ml', 9),
  offer('o4', 'mymarket', 'Palmolive Hygiene 750ml', 1),
  offer('o5', 'ab', 'Fairy Μήλο 900ml', 2),
];

const VERDICTS = [
  verdict('k1', ['sklavenitis', 'SOFTEX Silk Χαρτί Υγείας 8τεμ 760g'], ['mymarket', 'Softex Silk Χαρτί Υγείας 8άρι 0,760kg'], 'unsure', 'openai/gpt-oss-120b low', 'size words differ [A: 8τεμ, 760g | B: 8άρι, 0,760kg]'),
  verdict('k2', ['masoutis', 'Palmolive Exotic Orchid 750ml'], ['mymarket', 'Palmolive Hygiene 750ml'], 'different'),
  verdict('k3', ['ab', 'Fairy Μήλο 900ml'], ['lidl', 'Fairy Apple 900ml'], 'unsure'), // lidl offer gone
  verdict('k4', ['masoutis', 'Palmolive Exotic Orchid 750ml'], ['sklavenitis', 'SOFTEX Silk Χαρτί Υγείας 8τεμ 760g'], 'same', 'owner'),
];

describe('buildReviewRows', () => {
  it('lists only pairs whose two listings are both live, unsure first by default', () => {
    const { total, counts, rows } = buildReviewRows(VERDICTS, OFFERS);
    expect(counts).toEqual({ same: 1, different: 1, unsure: 1 });
    expect(total).toBe(1);
    expect(rows[0].pairKey).toBe('k1');
    expect(rows[0].a).toMatchObject({ chain: 'sklavenitis', offerId: 'o1', imageUrl: 'https://img/o1.jpg' });
    expect(rows[0].onlyB).toBe('8άρι, 0,760kg');
  });

  it('orders the most visible pairs first and marks owner decisions', () => {
    const { rows } = buildReviewRows(VERDICTS, OFFERS, { verdict: 'all' });
    expect(rows.map((r) => r.pairKey)).toEqual(['k2', 'k4', 'k1']);
    expect(rows.find((r) => r.pairKey === 'k4')?.byOwner).toBe(true);
  });

  it('filters by chain and by a search that ignores accents and case', () => {
    expect(buildReviewRows(VERDICTS, OFFERS, { verdict: 'all', chain: 'masoutis' }).rows.map((r) => r.pairKey)).toEqual(['k2', 'k4']);
    expect(buildReviewRows(VERDICTS, OFFERS, { verdict: 'all', q: 'χαρτι υγειασ' }).rows.map((r) => r.pairKey)).toEqual(['k4', 'k1']);
  });

  it('pages, and caps the page size', () => {
    const page = buildReviewRows(VERDICTS, OFFERS, { verdict: 'all', offset: 1, limit: 1 });
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.pairKey)).toEqual(['k4']);
    expect(buildReviewRows(VERDICTS, OFFERS, { verdict: 'all', limit: 10_000 }).rows).toHaveLength(3);
  });
});

describe('parseReason', () => {
  it('splits the why from the one-sided words', () => {
    expect(parseReason('variant only in B [A: - | B: Exotic] · was same (groq)')).toEqual({ why: 'variant only in B', onlyA: '', onlyB: 'Exotic' });
  });

  it('keeps free text as it is', () => {
    expect(parseReason('same barcode at both chains')).toEqual({ why: 'same barcode at both chains', onlyA: '', onlyB: '' });
    expect(parseReason(null)).toEqual({ why: '', onlyA: '', onlyB: '' });
  });
});
