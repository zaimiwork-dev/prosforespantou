import { describe, it, expect } from 'vitest';
import { comparisonChainCount } from './comparison-count';

const NOW = new Date('2026-07-08T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

const source = { productName: 'ΗΒΗ Πορτοκαλάδα με ανθρακικό 1,5lt', supermarket: 'masoutis' };

describe('comparisonChainCount', () => {
  it('counts distinct OTHER chains with a comparable offer', () => {
    const n = comparisonChainCount({
      source,
      clusterOffers: [
        { productName: 'ΗΒΗ Πορτοκαλάδα με ανθρακικό 1,5lt', supermarket: 'ab' },
        { productName: 'ΗΒΗ Πορτοκαλάδα ανθρακικό 1,5lt', supermarket: 'kritikos' },
      ],
      now: NOW,
    });
    expect(n).toBe(2);
  });

  it('does not count the source chain itself (web+leaflet twin rows)', () => {
    const n = comparisonChainCount({
      source,
      clusterOffers: [{ productName: source.productName, supermarket: 'masoutis' }],
      now: NOW,
    });
    expect(n).toBe(0);
  });

  it('blocks variant mismatches exactly like the sheet does', () => {
    const n = comparisonChainCount({
      source: { productName: 'Palmolive Αφρόλουτρο Μέλι 650ml', supermarket: 'masoutis' },
      clusterOffers: [{ productName: 'Palmolive Αφρόλουτρο Αμύγδαλο 650ml', supermarket: 'ab' }],
      now: NOW,
    });
    expect(n).toBe(0);
  });

  it('adds barcode-gated shelf chains, latest-per-chain and recency-gated', () => {
    const n = comparisonChainCount({
      source,
      clusterOffers: [],
      barcodeBacked: true,
      snapshots: [
        { supermarket: 'ab', price: 1.85, recordedAt: daysAgo(2) },
        { supermarket: 'ab', price: 1.79, recordedAt: daysAgo(5) }, // older dup, same chain
        { supermarket: 'lidl', price: 1.6, recordedAt: daysAgo(20) }, // stale → out
      ],
      now: NOW,
    });
    expect(n).toBe(1);
  });

  it('ignores snapshots entirely without a barcode', () => {
    const n = comparisonChainCount({
      source,
      clusterOffers: [],
      barcodeBacked: false,
      snapshots: [{ supermarket: 'ab', price: 1.85, recordedAt: daysAgo(2) }],
      now: NOW,
    });
    expect(n).toBe(0);
  });

  it('excludes shelf chains whose cluster offer was guard-dropped (mapping risk)', () => {
    const n = comparisonChainCount({
      source: { productName: 'Palmolive Αφρόλουτρο Μέλι 650ml', supermarket: 'masoutis' },
      clusterOffers: [
        // Different variant → offer row is dropped by the guard, but the chain
        // must STILL be excluded from shelf rows (same stale-mapping risk).
        { productName: 'Palmolive Αφρόλουτρο Αμύγδαλο 650ml', supermarket: 'ab' },
      ],
      barcodeBacked: true,
      snapshots: [
        { supermarket: 'ab', price: 2.1, recordedAt: daysAgo(1) },
        { supermarket: 'kritikos', price: 2.3, recordedAt: daysAgo(1) },
      ],
      now: NOW,
    });
    expect(n).toBe(1); // kritikos only
  });

  it('merges offer chains and shelf chains without double counting', () => {
    const n = comparisonChainCount({
      source,
      clusterOffers: [{ productName: source.productName, supermarket: 'ab' }],
      barcodeBacked: true,
      snapshots: [
        { supermarket: 'ab', price: 1.9, recordedAt: daysAgo(1) }, // excluded (has offer)
        { supermarket: 'kritikos', price: 1.95, recordedAt: daysAgo(1) },
      ],
      now: NOW,
    });
    expect(n).toBe(2); // ab (offer) + kritikos (shelf)
  });
});
