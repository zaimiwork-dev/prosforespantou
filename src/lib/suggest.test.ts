import { describe, it, expect } from 'vitest';
import { buildSuggestIndex, suggest, sameWordOtherCase, MAX_TERMS } from './suggest';

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

  it('offers department words as phrases, with their own accents, without outranking real products', () => {
    const r = suggest(idx, 'τυρ');
    expect(r.terms.map((t) => t.text)).toContain('Τυριά');
    expect(idx.terms.find((t) => t[0] === 'Τυριά')![1]).toBeLessThanOrEqual(1);
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
    // 40 distinct made-up brands, in Greek letters only (a word mixing scripts is skipped)
    const abc = 'αβγδεζηθικλμνξοπρστυφχψω';
    const many = buildSuggestIndex(
      Array.from({ length: 40 }, (_, i) => ({ productName: `Μπισκότα Μάρκα${abc[i % 24]}${abc[Math.floor(i / 24)]}κ Κλασικά`, category: 'Σνακ & Γλυκά' })),
    );
    expect(suggest(many, 'μπισ').terms.length).toBe(8);
  });
});

// Found against the live catalogue on 2026-11-13 (15k offers): each of these
// looked wrong to a Greek reader on the first real run.
describe('suggest — what a Greek shopper sees', () => {
  const SNACKS = 'Σνακ & Γλυκά';
  const CARE = 'Προσωπική Φροντίδα';
  const build = (list: [string, string, number][]) =>
    buildSuggestIndex(list.flatMap(([productName, category, n]) => Array.from({ length: n }, () => ({ productName, category }))));
  const texts = (r: { terms: { text: string }[] }) => r.terms.map((t) => t.text);

  it('puts the base word before a more common form that only extends it', () => {
    const idx = build([
      ['ΙΟΝ Σοκολάτα Γάλακτος 100γρ', SNACKS, 7],
      ['Γάλα ΔΕΛΤΑ Φρέσκο 1lt', DAIRY, 5],
    ]);
    const t = texts(suggest(idx, 'γαλ'));
    expect(t[0]).toBe('Γάλα');
    expect(t).toContain('Γάλακτος');
  });

  it('leaves a rare short word behind the common one it starts', () => {
    const idx = build([
      ['Τοστιέρα Izzy 800W', 'Άλλο', 20],
      ['Ψωμί Τοστ Σίκαλης', 'Αρτοποιία', 1],
    ]);
    expect(texts(suggest(idx, 'τοσ'))[0]).toBe('Τοστιέρα');
  });

  it('shows one case of a noun, not its genitive as a second suggestion', () => {
    const idx = build([
      ['Κοτόπουλο Φιλέτο Στήθος', 'Κρέας & Ψάρι', 5],
      ['Knorr Σούπα Κοτόπουλου', 'Είδη Παντοπωλείου', 3],
      ['Γιαούρτι Στραγγιστό ΦΑΓΕ', DAIRY, 6],
      ['Activia Επιδόρπιο Γιαουρτιού', DAIRY, 5],
      ['Σοκολάτα Lacta', SNACKS, 9],
      ['Παγωτό Σοκολάτας Έβγα', 'Κατεψυγμένα', 4],
    ]);
    expect(texts(suggest(idx, 'κοτ'))).toContain('Κοτόπουλο');
    expect(texts(suggest(idx, 'κοτ'))).not.toContain('Κοτόπουλου');
    expect(texts(suggest(idx, 'γιαου'))).not.toContain('Γιαουρτιού');
    expect(texts(suggest(idx, 'σοκολ'))).not.toContain('Σοκολάτας');
    // typed out, the genitive is still completed
    expect(texts(suggest(idx, 'κοτοπουλου'))).toContain('Κοτόπουλου');
  });

  it('does not fold singular and plural: feta is not «slices»', () => {
    const idx = build([
      ['Φέτα ΔΩΔΩΝΗ ΠΟΠ 400γρ', CHEESE, 3],
      ['Milner Τυρί σε Φέτες 175γρ', CHEESE, 6],
    ]);
    const t = texts(suggest(idx, 'φετ'));
    expect(t).toContain('Φέτα');
    expect(t).toContain('Φέτες');
  });

  it('knows which pairs are the same word in another case', () => {
    for (const [a, b] of [['κοτοπουλο', 'κοτοπουλου'], ['φρουτα', 'φρουτων'], ['γιαουρτι', 'γιαουρτιου'], ['τονοσ', 'τονο'], ['τονοσ', 'τονου'], ['σοκολατα', 'σοκολατασ']]) {
      expect(sameWordOtherCase(a, b), `${a} / ${b}`).toBe(true);
      expect(sameWordOtherCase(b, a), `${b} / ${a}`).toBe(true);
    }
    for (const [a, b] of [['φετα', 'φετεσ'], ['τυρι', 'τυρια'], ['γαλα', 'γαλακτοσ'], ['σοκολατα', 'σοκολατι'], ['nescafe', 'nescafes'], ['γαλα', 'γαλα']]) {
      expect(sameWordOtherCase(a, b), `${a} / ${b}`).toBe(false);
    }
  });

  it('never suggests a chain abbreviation («ΖΥΜ.») or a phrase built on one', () => {
    const idx = build([
      ['ΜΕΛΙΣΣΑ ΖΥΜ. ΛΑΖΑΝΑΚΙΑ 500ΓΡ', 'Είδη Παντοπωλείου', 5],
      ['Ζυμαρικά Barilla Penne 500γρ', 'Είδη Παντοπωλείου', 2],
    ]);
    const all = idx.terms.map((t) => t[0]);
    expect(all.some((t) => /(^| )ζυμ\.?( |$)/i.test(t))).toBe(false);
    expect(all).toContain('Ζυμαρικά');
    expect(all).toContain('Λαζανακια');
  });

  it('drops a capitals-only truncation of a common word, but keeps a real short word', () => {
    const idx = build([
      ['ULTREX ΣΑΜΠ DEEP CLEAN 360ML', CARE, 2],
      ['Σαμπουάν Pantene Repair 360ml', CARE, 12],
      ['Μέλι Αττική 250γρ', 'Είδη Παντοπωλείου', 2],
      ['ΜΕΛΙ ΑΝΘΕΩΝ 450ΓΡ', 'Είδη Παντοπωλείου', 1],
      ['Μέλισσα Μακαρόνια Νο6', 'Είδη Παντοπωλείου', 20],
    ]);
    const all = idx.terms.map((t) => t[0].toLowerCase());
    expect(all).not.toContain('σαμπ');
    expect(all.some((t) => t.split(' ').includes('σαμπ'))).toBe(false);
    expect(all).toContain('μέλι');
    expect(all).toContain('σαμπουάν');
  });

  it('does not move an unrelated short word in front of a longer one', () => {
    const idx = build([
      ['Πανάρισμα για Κοτόπουλο 200γρ', 'Είδη Παντοπωλείου', 8],
      ['Πάνα Βρακάκι Babylino', 'Βρεφικά Είδη', 3],
    ]);
    expect(texts(suggest(idx, 'πανα'))[0]).toBe('Πανάρισμα');
  });

  it('skips a word that mixes Greek and Latin letters', () => {
    const idx = build([
      ['Σαμπoyan Elvive 400ml', CARE, 4],
      ['Σαμπουάν Elvive 400ml', CARE, 6],
    ]);
    expect(texts(suggest(idx, 'σαμπ'))).toEqual(['Σαμπουάν', 'Σαμπουάν Elvive']);
  });

  it('names no aisle for a word spread over several', () => {
    const idx = build([
      ['Φέτα ΔΩΔΩΝΗ ΠΟΠ 400γρ', CHEESE, 4],
      ['Τυρόπιτα Χωριάτικη με Φέτα 850γρ', 'Κατεψυγμένα', 5],
    ]);
    expect(texts(suggest(idx, 'φετ'))[0]).toBe('Φέτα');
    expect(suggest(idx, 'φετ').categories).toEqual([]);
  });

  it('offers the aisle the query names and the one its first suggestion lives in — no others', () => {
    const idx = rows();
    // «Γαλάκτωμα» is personal care, but nobody typing «γαλ» asked for that aisle
    expect(suggest(idx, 'γαλ').categories.map((c) => c.id)).toEqual([DAIRY]);
    expect(suggest(idx, 'nesc').categories.map((c) => c.id)).toEqual([COFFEE]);
    expect(suggest(idx, 'φετ').categories.map((c) => c.id)).toEqual([CHEESE]);
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
