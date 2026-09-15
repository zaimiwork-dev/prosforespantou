import { describe, it, expect } from 'vitest';
import { isExpiredDatelessLeaflet, pruneExpiredDatelessLeaflets } from './leaflet-prune';

const NOW = new Date('2026-09-16T12:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86400000);

describe('isExpiredDatelessLeaflet', () => {
  it('a dateless leaflet past its auto-delete window is expired', () => {
    expect(isExpiredDatelessLeaflet({ id: 'a', validFrom: null, createdAt: daysAgo(8), autoDeleteDays: 7 }, NOW)).toBe(true);
  });

  it('inside the window, dated, or without a window it stays', () => {
    expect(isExpiredDatelessLeaflet({ id: 'a', validFrom: null, createdAt: daysAgo(6), autoDeleteDays: 7 }, NOW)).toBe(false);
    expect(isExpiredDatelessLeaflet({ id: 'a', validFrom: daysAgo(30), createdAt: daysAgo(30), autoDeleteDays: 7 }, NOW)).toBe(false);
    expect(isExpiredDatelessLeaflet({ id: 'a', validFrom: null, createdAt: daysAgo(30), autoDeleteDays: null }, NOW)).toBe(false);
  });
});

describe('pruneExpiredDatelessLeaflets', () => {
  it('deletes only the expired ids and reports the count', async () => {
    let deleted: string[] = [];
    const fake = {
      leaflet: {
        findMany: async () => [
          { id: 'old', validFrom: null, createdAt: daysAgo(10), autoDeleteDays: 7 },
          { id: 'fresh', validFrom: null, createdAt: daysAgo(1), autoDeleteDays: 7 },
        ],
        deleteMany: async (args: any) => { deleted = args.where.id.in; return { count: deleted.length }; },
      },
    };
    expect(await pruneExpiredDatelessLeaflets(fake, NOW)).toBe(1);
    expect(deleted).toEqual(['old']);
  });

  it('does not call deleteMany when nothing expired', async () => {
    let called = false;
    const fake = {
      leaflet: {
        findMany: async () => [{ id: 'fresh', validFrom: null, createdAt: daysAgo(1), autoDeleteDays: 7 }],
        deleteMany: async () => { called = true; return { count: 0 }; },
      },
    };
    expect(await pruneExpiredDatelessLeaflets(fake, NOW)).toBe(0);
    expect(called).toBe(false);
  });
});
