import { describe, it, expect } from 'vitest';
import * as S from './snapshot-seen.mjs';

const r = (id: string, productId: string, chainItemcode: string | null, price: number, day: number) =>
  ({ id, productId, chainItemcode, price, recordedAt: new Date(2026, 10, day) });

const retry = (_label: string, fn: () => unknown) => fn();

describe('snapshotLookupWhere', () => {
  it('adds the SKU only when known', () => {
    expect(S.snapshotLookupWhere('p', 'masoutis', '123')).toEqual({ productId: 'p', supermarket: 'masoutis', chainItemcode: '123' });
    expect(S.snapshotLookupWhere('p', 'masoutis', null)).toEqual({ productId: 'p', supermarket: 'masoutis' });
    expect(S.snapshotLookupWhere('p', 'masoutis', 123)).toMatchObject({ chainItemcode: '123' });
  });
});

describe('latestRowFor', () => {
  const rows = [r('a', 'p', 'A', 1, 5), r('b', 'p', 'B', 2, 6), r('n', 'p', null, 3, 1), r('o', 'q', 'A', 9, 1)];
  it('own SKU first', () => expect(S.latestRowFor(rows, 'p', 'A').id).toBe('a'));
  it('falls back to the legacy itemcode-less row', () => expect(S.latestRowFor(rows, 'p', 'C').id).toBe('n'));
  it('no itemcode: newest row of the product, any SKU', () => expect(S.latestRowFor(rows, 'p', null).id).toBe('b'));
  it('unknown product', () => expect(S.latestRowFor(rows, 'zzz', 'A')).toBeNull());
});

describe('pickSnapshotIdsToBump', () => {
  const latest = [r('a', 'p', 'A', 1, 5), r('b', 'p', 'B', 2, 6), r('n', 'q', null, 3, 1)];
  it('bumps only snapshots that still carry the seen price, once each', () => {
    const ids = S.pickSnapshotIdsToBump([
      { productId: 'p', chainItemcode: 'A', price: 1 },
      { productId: 'p', chainItemcode: 'A', price: 1 },
      { productId: 'p', chainItemcode: 'B', price: 9 }, // snapshot says 2: not this price
      { productId: 'q', chainItemcode: 'Z', price: 3 }, // legacy fallback
      { productId: 'x', chainItemcode: 'A', price: 1 }, // no snapshot
      { productId: 'p', chainItemcode: 'A', price: 7, snapshotId: 'direct' },
    ], latest);
    expect([...ids].sort()).toEqual(['a', 'direct', 'n']);
  });
});

describe('planNormalSnapshots', () => {
  const at = new Date('2026-11-13T00:00:00Z');
  const latest = [r('a', 'p', 'A', 1.5, 5), r('b', 'p', 'B', 2, 6)];
  it('splits changed / unchanged per SKU and stamps new rows', () => {
    const { toWrite, seenUnchanged } = S.planNormalSnapshots([
      { productId: 'p', chainItemcode: 'A', price: 1.5 }, // unchanged
      { productId: 'p', chainItemcode: 'B', price: 2.1 }, // moved
      { productId: 'n', chainItemcode: 'N', price: 4 }, // new
    ], latest, 'masoutis', at);
    expect(seenUnchanged).toHaveLength(1);
    expect(toWrite).toEqual([
      { productId: 'p', supermarket: 'masoutis', price: 2.1, isDiscounted: false, kind: 'normal', chainItemcode: 'B', recordedAt: at, lastSeenAt: at },
      { productId: 'n', supermarket: 'masoutis', price: 4, isDiscounted: false, kind: 'normal', chainItemcode: 'N', recordedAt: at, lastSeenAt: at },
    ]);
  });
});

describe('bumpLastSeen', () => {
  it('uses one updateMany per 1000 ids', async () => {
    const calls: any[] = [];
    const prisma = { priceSnapshot: { updateMany: async (a: any) => { calls.push(a); return { count: a.where.id.in.length }; } } };
    const ids = Array.from({ length: 2300 }, (_, i) => `id${i}`);
    const at = new Date();
    const n = await S.bumpLastSeen(prisma, ids, at, retry);
    expect(n).toBe(2300);
    expect(calls.map((c) => c.where.id.in.length)).toEqual([1000, 1000, 300]);
    expect(calls[0].data).toEqual({ lastSeenAt: at });
  });
  it('does nothing for no ids', async () => {
    const prisma = { priceSnapshot: { updateMany: async () => { throw new Error('no'); } } };
    expect(await S.bumpLastSeen(prisma, [], new Date(), retry)).toBe(0);
  });
});
