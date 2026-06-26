import { describe, expect, it } from 'vitest';
import { representativeCatalogCount } from './catalog-run-count';

describe('representativeCatalogCount', () => {
  it('uses the latest healthy full-sized catalog run', () => {
    expect(representativeCatalogCount([
      { scrapedItems: 5895 },
      { scrapedItems: 5918 },
      { scrapedItems: 6119 },
    ])).toBe(5895);
  });

  it('skips an obviously partial latest run', () => {
    expect(representativeCatalogCount([
      { scrapedItems: 33 },
      { scrapedItems: 7475 },
    ])).toBe(7475);
  });

  it('returns zero when no catalog has run', () => {
    expect(representativeCatalogCount([])).toBe(0);
  });
});
