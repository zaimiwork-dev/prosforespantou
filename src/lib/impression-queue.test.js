import { describe, it, expect } from 'vitest';
import { createImpressionQueue, surfaceFromPath, IMPRESSION_CAP, BATCH_MAX } from './impression-queue';

const item = (n, page = 'home:top') => ({ discountId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, page, position: n });

describe('createImpressionQueue', () => {
  it('counts a card once per surface, but again on a different surface', () => {
    const q = createImpressionQueue();
    expect(q.add(item(1))).toBe(true);
    expect(q.add(item(1))).toBe(false);
    expect(q.add(item(1, 'deals'))).toBe(true);
    expect(q.size()).toBe(2);
  });

  it(`stops at the session cap (${IMPRESSION_CAP}), including what earlier page loads used`, () => {
    const q = createImpressionQueue({ cap: 3, initialCount: 2 });
    expect(q.add(item(1))).toBe(true);
    expect(q.add(item(2))).toBe(false);
    expect(q.count()).toBe(3);
  });

  it('drains in server-sized batches and keeps the rest', () => {
    const q = createImpressionQueue();
    for (let i = 0; i < BATCH_MAX + 7; i++) q.add(item(i));
    expect(q.drain()).toHaveLength(BATCH_MAX);
    expect(q.size()).toBe(7);
    expect(q.drain()).toHaveLength(7);
    expect(q.size()).toBe(0);
  });

  it('refuses malformed items', () => {
    const q = createImpressionQueue();
    expect(q.add(null)).toBe(false);
    expect(q.add({ page: 'home' })).toBe(false);
    expect(q.add({ discountId: 'x' })).toBe(false);
  });
});

describe('surfaceFromPath', () => {
  it('maps routes to low-cardinality surface names', () => {
    expect(surfaceFromPath('/')).toBe('home');
    expect(surfaceFromPath('/deals')).toBe('deals');
    expect(surfaceFromPath('/supermarket/lidl')).toBe('supermarket');
    expect(surfaceFromPath('/search')).toBe('search');
    expect(surfaceFromPath(undefined)).toBe('home');
  });
});
