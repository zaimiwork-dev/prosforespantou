import { describe, expect, it } from 'vitest';
import { filterByVerdict, itemKey, loadVerdictLookup, mergeVerdict, pairKey, pairKeyOf, verdictAllows, type Verdict } from './comparison-verdict';

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

describe('item keys — the chain item is the slot, whatever its name', () => {
  it('keys by chain + item code when there is one, by name otherwise', () => {
    expect(itemKey({ chain: 'ab', code: '7122', name: 'Lurpak 225g' })).toBe('ab#7122');
    expect(itemKey({ chain: 'ab', code: null, name: 'Lurpak  225g' })).toBe('ab|lurpak 225g');
  });

  it('a renamed listing keeps its verdict', () => {
    const before = pairKeyOf({ chain: 'ab', code: '7122', name: 'Lurpak Βούτυρο 225g' }, { chain: 'masoutis', code: '2160844', name: 'Lurpak 225γρ.' });
    const after = pairKeyOf({ chain: 'masoutis', code: '2160844', name: 'LURPAK Βούτυρο Ανάλατο 225g' }, { chain: 'ab', code: '7122', name: 'Lurpak Butter 225 g' });
    expect(after).toBe(before);
  });

  it('two different items with the same name get different keys', () => {
    const other = { chain: 'sklavenitis', code: '55', name: 'Ψωμί Τοστ' };
    expect(pairKeyOf({ chain: 'ab', code: '1', name: 'Ψωμί Τοστ Ολικής 720g' }, other))
      .not.toBe(pairKeyOf({ chain: 'ab', code: '2', name: 'Ψωμί Τοστ Ολικής 720g' }, other));
  });

  it('without codes it is the old name key', () => {
    expect(pairKeyOf({ chain: 'a', name: 'x' }, { chain: 'b', name: 'y' })).toBe(pairKey('a', 'x', 'b', 'y'));
  });
});

describe('filterByVerdict', () => {
  const side = (r: { n: string; c: string; k?: string }) => ({ chain: r.c, code: r.k, name: r.n });

  it('drops the rival a verdict calls different', () => {
    const src = { name: 'Palmolive Αφρόλουτρο Spa Pink Massage 650ml', chain: 'mymarket', code: 'mm1' };
    const rivals = [
      { n: 'PALMOLIVE Thermal Spa Αφρόλουτρο Mineral Massage 650ml', c: 'sklavenitis', k: 'sk1' },
      { n: 'Palmolive Spa Pink Massage Αφρόλουτρο 650ml', c: 'masoutis', k: 'ma1' },
    ];
    const verdicts = new Map<string, Verdict>([[pairKeyOf(src, side(rivals[0])), 'different']]);
    const kept = filterByVerdict(src, rivals, side, (k) => verdicts.get(k), 'block-different');
    expect(kept.map((r) => r.c)).toEqual(['masoutis']);
    expect(filterByVerdict(src, rivals, side, (k) => verdicts.get(k), 'require-same')).toEqual([]);
  });

  it('never hides a row from the source chain itself (its web + leaflet copy)', () => {
    const src = { name: 'Lurpak Βούτυρο 225g', chain: 'ab' };
    const rows = [{ n: 'Lurpak Βούτυρο 225g', c: 'ab' }];
    expect(filterByVerdict(src, rows, side, () => undefined, 'require-same')).toEqual(rows);
  });
});

describe('mergeVerdict', () => {
  const groq = (verdict: string) => ({ verdict, model: 'openai/gpt-oss-120b low' });

  it('takes the verdict of a pair nobody judged yet', () => {
    expect(mergeVerdict(undefined, 'same')).toBe('same');
  });

  it('never touches an owner or barcode verdict', () => {
    expect(mergeVerdict({ verdict: 'same', model: 'owner' }, 'different')).toBeNull();
    expect(mergeVerdict({ verdict: 'same', model: 'barcode' }, 'unsure')).toBeNull();
  });

  it('keeps «different», and lets a second opinion pull «same» down', () => {
    expect(mergeVerdict(groq('different'), 'same')).toBeNull();
    expect(mergeVerdict(groq('same'), 'same')).toBeNull();
    expect(mergeVerdict(groq('same'), 'different')).toBe('different');
    expect(mergeVerdict(groq('same'), 'unsure')).toBe('unsure');
  });

  it('replaces «unsure» only when asked to', () => {
    expect(mergeVerdict(groq('unsure'), 'same')).toBeNull();
    expect(mergeVerdict(groq('unsure'), 'same', { replaceUnsure: true })).toBe('same');
    expect(mergeVerdict(groq('unsure'), 'unsure', { replaceUnsure: true })).toBeNull();
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
