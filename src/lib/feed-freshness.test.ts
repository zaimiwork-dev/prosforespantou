import { describe, it, expect } from 'vitest';
import { freshShelfChains, SHELF_FEED_MAX_AGE_DAYS } from './feed-freshness';

const NOW = new Date('2026-09-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const run = (chain: string, source: string, days: number, items: number, healthOk = true) =>
  ({ chain, source, finishedAt: daysAgo(days), scrapedItems: items, healthOk });

describe('freshShelfChains', () => {
  it('a chain with a recent healthy catalog run is fresh, stamped with that run time', () => {
    const fresh = freshShelfChains([run('masoutis', 'catalog', 2, 10441)], NOW);
    expect(fresh.get('masoutis')).toBe(daysAgo(2));
  });

  it('a daily baseline feed counts the same as a catalog feed', () => {
    const fresh = freshShelfChains([run('kritikos', 'baseline', 0.3, 4986)], NOW);
    expect(fresh.has('kritikos')).toBe(true);
  });

  it('a chain whose last representative run is older than the window is NOT fresh', () => {
    const fresh = freshShelfChains([run('ab', 'catalog', SHELF_FEED_MAX_AGE_DAYS + 1, 11442)], NOW);
    expect(fresh.has('ab')).toBe(false);
  });

  it('a partial run does not count as evidence — the 29-item Sklavenitis case', () => {
    // 09-06 full crawl (9 days old, still inside the window) then a 29-item
    // run on 09-13 recorded healthy. Fresh, but on the strength of 09-06.
    const fresh = freshShelfChains(
      [run('sklavenitis', 'catalog', 2, 29), run('sklavenitis', 'catalog', 9, 7475)],
      NOW
    );
    expect(fresh.get('sklavenitis')).toBe(daysAgo(9));
  });

  it('…and once the only full run ages out, a fresh partial run does not keep the chain alive', () => {
    const fresh = freshShelfChains(
      [run('sklavenitis', 'catalog', 2, 29), run('sklavenitis', 'catalog', 12, 7475)],
      NOW
    );
    expect(fresh.has('sklavenitis')).toBe(false);
  });

  it('unhealthy runs, wolt enrichment runs and offer feeds are ignored', () => {
    const fresh = freshShelfChains(
      [
        run('ab', 'catalog', 1, 11442, false),
        run('mymarket', 'wolt', 1, 7391),
        run('kritikos', 'web', 1, 3095),
      ],
      NOW
    );
    expect(fresh.size).toBe(0);
  });

  it('small feeds (peak ≤ 20) are not subjected to the half-of-peak rule', () => {
    const fresh = freshShelfChains([run('tiny', 'catalog', 1, 3), run('tiny', 'catalog', 8, 12)], NOW);
    expect(fresh.get('tiny')).toBe(daysAgo(1));
  });

  it('rejects future timestamps and unparsable dates', () => {
    const fresh = freshShelfChains(
      [
        { chain: 'ab', source: 'catalog', finishedAt: new Date(NOW.getTime() + 3600_000), scrapedItems: 11000, healthOk: true },
        { chain: 'lidl', source: 'catalog', finishedAt: 'not a date', scrapedItems: 280, healthOk: true },
      ],
      NOW
    );
    expect(fresh.size).toBe(0);
  });
});
