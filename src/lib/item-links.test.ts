import { describe, expect, it } from 'vitest';
import { linkGraph, linkedItems, loadLinksFor } from './item-links';

const row = (chainA: string, codeA: string | null, chainB: string, codeB: string | null, verdict = 'same') =>
  ({ chainA, codeA, chainB, codeB, verdict });

describe('linkGraph', () => {
  it('links both ways, from «same» rows with both codes only', () => {
    const g = linkGraph([
      row('ab', '1', 'masoutis', '9'),
      row('ab', '1', 'sklavenitis', '5', 'unsure'),
      row('ab', '2', 'mymarket', null),
    ]);
    expect(linkedItems(g, { chain: 'ab', code: '1' })).toEqual([{ chain: 'masoutis', code: '9' }]);
    expect(linkedItems(g, { chain: 'masoutis', code: '9' })).toEqual([{ chain: 'ab', code: '1' }]);
    expect(linkedItems(g, { chain: 'ab', code: '2' })).toEqual([]);
  });

  it('is not transitive: A~B and B~C do not make A~C', () => {
    const g = linkGraph([row('ab', '1', 'masoutis', '9'), row('masoutis', '9', 'lidl', '7')]);
    expect(linkedItems(g, { chain: 'ab', code: '1' })).toEqual([{ chain: 'masoutis', code: '9' }]);
  });

  it('ignores a row inside one chain and an item without a code', () => {
    const g = linkGraph([row('ab', '1', 'ab', '2')]);
    expect(linkedItems(g, { chain: 'ab', code: '1' })).toEqual([]);
    expect(linkedItems(g, { chain: 'ab', code: null })).toEqual([]);
  });
});

describe('loadLinksFor', () => {
  it('asks only for «same» rows touching the given items, and nothing without codes', async () => {
    const calls: unknown[] = [];
    const prisma = { comparisonVerdict: { findMany: async (args: unknown) => { calls.push(args); return [row('ab', '1', 'masoutis', '9')]; } } };
    const g = await loadLinksFor(prisma, [{ chain: 'ab', code: '1' }]);
    expect(linkedItems(g, { chain: 'ab', code: '1' })).toEqual([{ chain: 'masoutis', code: '9' }]);
    expect(JSON.stringify(calls[0])).toContain('"verdict":"same"');
    await loadLinksFor(prisma, [{ chain: 'ab', code: null }]);
    expect(calls).toHaveLength(1);
  });
});
