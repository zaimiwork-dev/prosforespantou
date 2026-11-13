import { describe, it, expect } from 'vitest';
import { buildSuggestIndex, suggest, MAX_TERMS } from './suggest';

const LABELS = { 'Γαλακτοκομικά & Είδη Ψυγείου': 'Γαλακτοκομικά', 'Πρωινό & Ροφήματα': 'Πρωινό & Καφές', 'Τυριά & Αλλαντικά': 'Τυριά & Αλλαν.' };

const DAIRY = 'Γαλακτοκομικά & Είδη Ψυγείου';
const COFFEE = 'Πρωινό & Ροφήματα';
const CHEESE = 'Τυριά & Αλλαντικά';

function rows() {
  const r: { productName: string; category: string }[] = [];
  const add = (name: string, category: string, n = 1) => {
    for (let i = 0; i < n; i++) r.push({ productName: name, category });
  };
  add('Nescafe Classic 200gr', COFFEE, 5);
  add('NESCAFE ΓΚΟΛΝΤ 100ΓΡ', COFFEE, 2);
  add('Nescafe Classic Στιγμιαίος 100gr', COFFEE, 1);
  add('Γάλα ΔΕΛΤΑ Φρέσκο 1lt', DAIRY, 6);
  add('ΓΑΛΑ ΒΛΑΧΑΣ ΕΒΑΠΟΡΕ 410ΓΡ', DAIRY, 3);
  add('Γιαούρτι ΔΩΔΩΝΗ Στραγγιστό 3x200γρ', DAIRY, 4);
  add('Φέτα ΔΩΔΩΝΗ ΠΟΠ 400γρ', CHEESE, 4);
  add('Ωμή Ζελατίνη με Γάλα για παιδιά', 'Άλλο', 1);
  add('Κρέμα Μπόντι ΓΑΛΑκτωμα 250ml', 'Προσωπική Φροντίδα', 2);
  return buildSuggestIndex(r, LABELS);
}

describe('suggest', () => {
  const idx = rows();

  it('completes a Latin brand prefix with its two-word phrases, most-offered first', () => {
    const r = suggest(idx, 'nesc');
    expect(r.terms[0].text).toBe('Nescafe');
    expect(r.terms.map((t) => t.text)).toContain('Nescafe Classic');
    const classic = r.terms.find((t) => t.text === 'Nescafe Classic')!;
    expect(classic.count).toBe(6);
  });

  it('completes Greek, accent-insensitively, and finds the accented spelling', () => {
    for (const q of ['γαλ', 'ΓΑΛ', 'γάλ']) {
      const r = suggest(idx, q);
      expect(r.terms.map((t) => t.text)).toContain('Γάλα');
    }
  });

  it('matches the start of any word, and ignores final sigma and accents', () => {
    const r = suggest(idx, 'δελτα');
    expect(r.terms.some((t) => /Γάλα Δελτα|Δελτα|ΔΕΛΤΑ/i.test(t.text))).toBe(true);
    expect(suggest(idx, 'στραγγ').terms.length).toBeGreaterThan(0);
    // typed with a final sigma / with accents the same list comes back
    expect(suggest(idx, 'φετα').terms.map((t) => t.text)).toEqual(suggest(idx, 'φέτα').terms.map((t) => t.text));
  });

  it('understands greeklish', () => {
    expect(suggest(idx, 'gala').terms.map((t) => t.text)).toContain('Γάλα');
  });

  it('does not turn Greek input into Latin completions', () => {
    const odd = buildSuggestIndex([{ productName: 'Galaxy Chocolate 100g', category: 'Σνακ & Γλυκά' }]);
    expect(suggest(odd, 'γαλα').terms).toEqual([]);
  });

  it('never invents counts: a phrase counts each offer once', () => {
    const r = suggest(idx, 'γαλα');
    const gala = r.terms.find((t) => t.text === 'Γάλα')!;
    // Γάλα ΔΕΛΤΑ ×6, ΓΑΛΑ ΒΛΑΧΑΣ ×3 and «Ωμή Ζελατίνη με Γάλα» ×1
    expect(gala.count).toBe(10);
  });

  it('suggests departments by their words and by where the matches live', () => {
    const byWord = suggest(idx, 'τυρ');
    expect(byWord.categories.map((c) => c.id)).toContain(CHEESE);
    expect(byWord.categories[0].label).toBe('Τυριά & Αλλαν.');
    const byTerm = suggest(idx, 'nesc');
    expect(byTerm.categories[0].id).toBe(COFFEE);
    expect(suggest(idx, 'γαλ').categories.map((c) => c.id)).toContain(DAIRY);
    expect(suggest(idx, 'γαλ').categories.length).toBeLessThanOrEqual(3);
  });

  it('keeps sizes, units and filler out of the suggestions', () => {
    const all = idx.terms.map((t) => t[0].toLowerCase());
    expect(all.some((t) => /\d/.test(t))).toBe(false);
    expect(all).not.toContain('με');
    expect(all).not.toContain('για');
    expect(all).not.toContain('γρ');
  });

  it('shows shouted names in a readable case', () => {
    expect(idx.terms.some((t) => t[0] === 'ΚΟΥΒΕΡΤΟΥΡΑ')).toBe(false);
    const caps = buildSuggestIndex([{ productName: 'ΚΟΥΒΕΡΤΟΥΡΑ ΣΟΚΟΛ ΥΓΕΙΑΣ ΣΤΑΓΟΝΕΣ 100ΓΡ', category: 'Σνακ & Γλυκά' }]);
    expect(caps.terms.map((t) => t[0])).toContain('Κουβερτουρα');
  });

  it('returns nothing for a 1-character query or an unknown one', () => {
    expect(suggest(idx, 'γ').terms).toEqual([]);
    expect(suggest(idx, 'ξψζωχ').terms).toEqual([]);
    expect(suggest(idx, '  ').categories).toEqual([]);
  });

  it('caps at 8 terms and 3 departments', () => {
    const many = buildSuggestIndex(
      Array.from({ length: 40 }, (_, i) => ({ productName: `Μπισκότα Μάρκα${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} Κλασικά`, category: 'Σνακ & Γλυκά' })),
    );
    expect(suggest(many, 'μπισ').terms.length).toBe(8);
  });
});

// A deterministic stand-in for ~15k real offer names: chain-style spellings
// (caps, Latin brands, sizes), many brands and nouns so the phrase count
// reaches the cap the way the live catalogue will.
function synthetic(n: number) {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const syl = ['κα', 'λο', 'μα', 'νι', 'πε', 'ρα', 'σο', 'τυ', 'φι', 'χα', 'βε', 'δι', 'ζο', 'θε', 'ξε', 'ψα'];
  const word = (k: number) => Array.from({ length: k }, () => pick(syl)).join('');
  const brands = Array.from({ length: 1200 }, (_, i) => (i % 3 === 0 ? word(3).toUpperCase() : i % 3 === 1 ? word(2) + 'ex' : word(3)));
  const nouns = Array.from({ length: 900 }, () => word(3));
  const adj = Array.from({ length: 300 }, () => word(2));
  const sizes = ['200γρ', '1lt', '500ml', '3x200γρ', '1,5L', '12τεμ', '750ml', 'Νο4'];
  const cats = ['Γαλακτοκομικά & Είδη Ψυγείου', 'Σνακ & Γλυκά', 'Κάβα', 'Είδη Παντοπωλείου', 'Κατεψυγμένα'];
  return Array.from({ length: n }, () => ({
    productName: `${pick(nouns)} ${pick(brands)} ${pick(adj)} ${pick(adj)} ${pick(sizes)}`,
    category: pick(cats),
  }));
}

describe('index size', () => {
  it('stays far under 2 MB for 15,000 offer names', () => {
    const idx = buildSuggestIndex(synthetic(15000));
    const bytes = Buffer.byteLength(JSON.stringify(idx), 'utf8');
    console.log(`[suggest] index for 15,000 names: ${idx.terms.length} terms, ${bytes} bytes (${(bytes / 1024).toFixed(0)} KB)`);
    expect(idx.terms.length).toBeLessThanOrEqual(MAX_TERMS);
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
    // and a query over it stays instant
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) suggest(idx, 'κα');
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
