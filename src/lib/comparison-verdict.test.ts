import { describe, expect, it } from 'vitest';
import { filterByVerdict, loadVerdictLookup, pairKey, verdictAllows, type Verdict } from './comparison-verdict';

describe('pairKey', () => {
  it('is the same whichever side comes first', () => {
    expect(pairKey('mymarket', 'Palmolive Αφρόλουτρο Spa Pink Massage 650ml', 'sklavenitis', 'PALMOLIVE Thermal Spa Αφρόλουτρο Mineral Massage 650ml'))
      .toBe(pairKey('sklavenitis', 'PALMOLIVE Thermal Spa Αφρόλουτρο Mineral Massage 650ml', 'mymarket', 'Palmolive Αφρόλουτρο Spa Pink Massage 650ml'));
  });

  it('ignores letter case and extra spaces, but not the chain or the words', () => {
    const k = pairKey('ab', 'Lurpak Βούτυρο 225g', 'masoutis', 'Lurpak Βούτυρο Ανάλατο 225γρ.');
    expect(pairKey('ab', '  lurpak  βούτυρο 225g ', 'masoutis', 'LURPAK ΒΟΎΤΥΡΟ ΑΝΆΛΑΤΟ 225ΓΡ.')).toBe(k);
    expect(pairKey('lidl', 'Lurpak Βούτυρο 225g', 'masoutis', 'Lurpak Βούτυρο Ανάλατο 225γρ.')).not.toBe(k);
    expect(pairKey('ab', 'Lurpak Βούτυρο Αλατισμένο 225g', 'masoutis', 'Lurpak Βούτυρο Ανάλατο 225γρ.')).not.toBe(k);
  });

  it('is 16 hex characters', () => {
    expect(pairKey('a', 'x', 'b', 'y')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('verdictAllows', () => {
  it('while verifying, hides only pairs judged different or unsure', () => {
    expect(verdictAllows('same', 'block-different')).toBe(true);
    expect(verdictAllows(undefined, 'block-different')).toBe(true);
    expect(verdictAllows('different', 'block-different')).toBe(false);
    expect(verdictAllows('unsure', 'block-different')).toBe(false);
  });

  it('in the goal state, shows only pairs confirmed the same', () => {
    expect(verdictAllows('same', 'require-same')).toBe(true);
    expect(verdictAllows(undefined, 'require-same')).toBe(false);
    expect(verdictAllows('unsure', 'require-same')).toBe(false);
  });

  it('can be switched off', () => {
    expect(verdictAllows('different', 'off')).toBe(true);
  });
});

describe('filterByVerdict', () => {
  it('drops the rival a verdict calls different', () => {
    const src = { name: 'Palmolive Αφρόλουτρο Spa Pink Massage 650ml', chain: 'mymarket' };
    const rivals = [
      { n: 'PALMOLIVE Thermal Spa Αφρόλουτρο Mineral Massage 650ml', c: 'sklavenitis' },
      { n: 'Palmolive Spa Pink Massage Αφρόλουτρο 650ml', c: 'masoutis' },
    ];
    const verdicts = new Map<string, Verdict>([[pairKey(src.chain, src.name, rivals[0].c, rivals[0].n), 'different']]);
    const kept = filterByVerdict(src, rivals, (r) => r.n, (r) => r.c, (k) => verdicts.get(k), 'block-different');
    expect(kept.map((r) => r.c)).toEqual(['masoutis']);
    expect(filterByVerdict(src, rivals, (r) => r.n, (r) => r.c, (k) => verdicts.get(k), 'require-same')).toEqual([]);
  });

  it('never hides a row from the source chain itself (its web + leaflet copy)', () => {
    const src = { name: 'Lurpak Βούτυρο 225g', chain: 'ab' };
    const rows = [{ n: 'Lurpak Βούτυρο 225g', c: 'ab' }];
    expect(filterByVerdict(src, rows, (r) => r.n, (r) => r.c, () => undefined, 'require-same')).toEqual(rows);
  });
});

describe('loadVerdictLookup', () => {
  it('reads only the asked pairs, once each, and skips the query when there are none', async () => {
    const calls: unknown[] = [];
    const prisma = {
      comparisonVerdict: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return [{ pairKey: 'k1', verdict: 'different' }];
        },
      },
    };
    const lookup = await loadVerdictLookup(prisma, ['k1', 'k1', 'k2']);
    expect(lookup('k1')).toBe('different');
    expect(lookup('k2')).toBeUndefined();
    expect(calls).toEqual([{ where: { pairKey: { in: ['k1', 'k2'] } }, select: { pairKey: true, verdict: true } }]);

    await loadVerdictLookup(prisma, []);
    expect(calls).toHaveLength(1);
  });
});
