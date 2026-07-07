import { describe, it, expect } from 'vitest';
import { interleaveByCategory } from './interleave-deals';

const d = (id, category) => ({ id, category });

describe('interleaveByCategory', () => {
  it('rotates across categories while keeping each category rank-ordered', () => {
    const out = interleaveByCategory([
      d('p1', 'Κατοικίδια'), d('p2', 'Κατοικίδια'), d('p3', 'Κατοικίδια'),
      d('c1', 'Καφές'), d('f1', 'Φρούτα'), d('p4', 'Κατοικίδια'),
    ]);
    expect(out.map((x) => x.id)).toEqual(['p1', 'c1', 'f1', 'p2', 'p3', 'p4']);
  });

  it('is a no-op for a single category or tiny lists', () => {
    const single = [d('a', 'Καφές'), d('b', 'Καφές'), d('c', 'Καφές')];
    expect(interleaveByCategory(single)).toEqual(single);
    const tiny = [d('a', 'x'), d('b', 'y')];
    expect(interleaveByCategory(tiny)).toEqual(tiny);
  });

  it('buckets missing categories under Άλλο without dropping anything', () => {
    const out = interleaveByCategory([d('a', null), d('b', 'Καφές'), d('c', null), d('e', 'Καφές')]);
    expect(out).toHaveLength(4);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'e']);
  });
});
