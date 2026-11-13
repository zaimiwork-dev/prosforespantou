// Search suggestions («πληκτρολογείς γαλ → γάλα, Γάλα ΔΕΛΤΑ, σε Γαλακτοκομικά»).
//
// Why a prebuilt index: a suggestion is asked after nearly every keystroke, so
// it must never touch the database. buildSuggestIndex() turns the names of the
// active offers into a few thousand phrases with counts ONCE (cached 5 min by
// get-suggest-index.ts); suggest() then only scans that list.
//
// What becomes a phrase: every word of a name (unigrams, e.g. «Γάλα»), and the
// first two/three words of a name (brand-first or noun-first, e.g. «Nescafe
// Classic», «Γάλα ΔΕΛΤΑ Φρέσκο»), plus the words of the department names. Words
// with digits, sizes, units and filler («με», «και», «τεμ») never become
// phrases. The list is capped (MAX_TERMS, most-offered first) so the cached
// entry stays small whatever the catalogue grows to.
//
// Pure + strip-safe (no enums/decorators): imported by a server action and by
// vitest; the only dependencies are the search normaliser and the categorizer
// so matching agrees with the search itself (accents, final sigma, greeklish).

import { expandSearch, normalizeSearchText } from './search-rank.ts';
import { DEPARTMENTS } from './categories.ts';

export const MAX_TERMS = 6000;
export const MAX_SUGGESTED_TERMS = 8;
export const MAX_SUGGESTED_DEPARTMENTS = 3;

// [display text, offers containing it, index into SuggestIndex.departments of
// the department most of those offers are in (-1 = none/«Άλλο»)]
export type SuggestTerm = [string, number, number];

export type SuggestIndex = {
  departments: { id: string; label: string; count: number }[];
  terms: SuggestTerm[];
};

export type SuggestResult = {
  query: string;
  terms: { text: string; count: number }[];
  categories: { id: string; label: string; count: number }[];
};

type Row = { productName?: string | null; category?: string | null };

const OTHER = 'Άλλο';
const DEPT_SET = new Set<string>(DEPARTMENTS);

// Words that are never worth suggesting on their own or at the end of a phrase.
const STOP = new Set(
  [
    'με', 'και', 'για', 'απο', 'του', 'της', 'των', 'στο', 'στη', 'την', 'τον', 'ενα', 'μια', 'σε', 'το', 'τα', 'η', 'ο', 'οι',
    'τεμ', 'τεμαχια', 'τεμαχιο', 'pcs', 'ml', 'gr', 'kg', 'lt', 'cl', 'γρ', 'κιλο', 'λιτρο', 'ειδη', 'ειδων', 'πακετο', 'συσκ',
    'the', 'and', 'of', 'with', 'new', 'νεο', 'νεα',
  ].map(normalizeSearchText),
);

const WORD_RE = /^[\p{L}][\p{L}'’-]*$/u;
const CLEAN_EDGE_RE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function wordsOf(name: string): string[] {
  // Tokens that are not plain words (sizes, prices, «3x500γρ», «&») end the
  // phrase-able prefix but are skipped for unigrams — see buildSuggestIndex.
  return name.split(/\s+/).map((t) => t.replace(CLEAN_EDGE_RE, '')).filter(Boolean);
}

// ALL-CAPS names are shouted by the chains; show «Κουβερτούρα» not «ΚΟΥΒΕΡΤΟΥΡΑ».
// (Accents are lost in caps; a mixed-case spelling seen elsewhere wins, see quality.)
function tidy(phrase: string): string {
  return phrase
    .split(' ')
    .map((w) => {
      const letters = w.replace(/[^\p{L}]/gu, '');
      if (letters.length > 3 && w === w.toUpperCase() && w !== w.toLowerCase()) {
        return w.charAt(0) + w.slice(1).toLowerCase();
      }
      return w;
    })
    .join(' ');
}

// Higher = a nicer spelling to show for the same normalised phrase.
function quality(raw: string): number {
  const shouted = raw === raw.toUpperCase() && raw !== raw.toLowerCase();
  const accented = raw !== normalizeSearchText(raw) && /[άέήίόύώϊϋΐΰ]/i.test(raw) ? 1 : 0;
  return (shouted ? 0 : 2) + accented;
}

type Acc = { count: number; forms: Map<string, number>; depts: Map<number, number> };

function bump(map: Map<string, Acc>, key: string, raw: string, dept: number, by = 1) {
  let a = map.get(key);
  if (!a) {
    a = { count: 0, forms: new Map(), depts: new Map() };
    map.set(key, a);
  }
  a.count += by;
  a.forms.set(raw, (a.forms.get(raw) ?? 0) + by);
  if (dept >= 0) a.depts.set(dept, (a.depts.get(dept) ?? 0) + by);
}

export function buildSuggestIndex(rows: Row[], labels: Record<string, string> = {}): SuggestIndex {
  const deptIds = DEPARTMENTS.filter((d) => d !== OTHER);
  const deptIndex = new Map<string, number>(deptIds.map((d, i) => [d, i]));
  const deptCount = deptIds.map(() => 0);
  const acc = new Map<string, Acc>();

  for (const row of rows) {
    const name = (row.productName ?? '').trim();
    if (!name) continue;
    const cat = row.category && DEPT_SET.has(row.category) ? row.category : OTHER;
    const dept = deptIndex.get(cat) ?? -1;
    if (dept >= 0) deptCount[dept]++;

    const tokens = wordsOf(name);
    const seen = new Set<string>(); // an offer counts once per phrase

    // Unigrams: every plain word of at least 3 letters.
    for (const t of tokens) {
      if (!WORD_RE.test(t) || t.length < 3) continue;
      const key = normalizeSearchText(t);
      if (STOP.has(key) || seen.has(key)) continue;
      seen.add(key);
      bump(acc, key, t, dept);
    }

    // Leading phrases: the first 2 and 3 words, as long as they are plain words.
    const lead: string[] = [];
    for (const t of tokens) {
      if (!WORD_RE.test(t)) break;
      lead.push(t);
      if (lead.length === 3) break;
    }
    for (let n = 2; n <= lead.length; n++) {
      const parts = lead.slice(0, n);
      const lastKey = normalizeSearchText(parts[n - 1]);
      if (STOP.has(lastKey) || parts[n - 1].length < 2) continue;
      const raw = parts.join(' ');
      const key = normalizeSearchText(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      bump(acc, key, raw, dept);
    }
  }

  // Department words (so «τυρ» offers «Τυριά» even when no name starts with it).
  // Counted as the department's offers; spelled with the department's accents.
  deptIds.forEach((id, i) => {
    if (!deptCount[i]) return;
    for (const w of id.split(/\s+/)) {
      const clean = w.replace(CLEAN_EDGE_RE, '');
      const key = normalizeSearchText(clean);
      if (clean.length < 4 || STOP.has(key)) continue;
      const existing = acc.get(key);
      // Boost the department spelling so it beats a shouted name form.
      bump(acc, key, clean, i, 0);
      const a = acc.get(key)!;
      a.forms.set(clean, (a.forms.get(clean) ?? 0) + 1_000_000);
      a.count = Math.max(a.count, deptCount[i]);
      if (!existing) a.depts.set(i, a.count);
    }
  });

  const terms: SuggestTerm[] = [];
  for (const a of acc.values()) {
    let best = '';
    let bestQ = -1;
    let bestN = -1;
    for (const [form, n] of a.forms) {
      const q = quality(form);
      if (q > bestQ || (q === bestQ && n > bestN)) {
        best = form;
        bestQ = q;
        bestN = n;
      }
    }
    let dom = -1;
    let domN = 0;
    for (const [d, n] of a.depts) {
      if (n > domN) {
        dom = d;
        domN = n;
      }
    }
    terms.push([tidy(best), a.count, dom]);
  }
  terms.sort((x, y) => y[1] - x[1] || x[0].length - y[0].length || (x[0] < y[0] ? -1 : 1));
  if (terms.length > MAX_TERMS) terms.length = MAX_TERMS;

  const departments = deptIds.map((id, i) => ({ id, label: labels[id] ?? id, count: deptCount[i] }));
  return { departments, terms };
}

// 0 = the normalised phrase starts with the query, 1 = a later word does, -1 = no.
function matchTier(norm: string, q: string): number {
  if (norm.startsWith(q)) return 0;
  return norm.includes(' ' + q) ? 1 : -1;
}

const normMemo = new WeakMap<SuggestIndex, string[]>();
function normalisedTerms(index: SuggestIndex): string[] {
  let n = normMemo.get(index);
  if (!n) {
    n = index.terms.map((t) => normalizeSearchText(t[0]));
    normMemo.set(index, n);
  }
  return n;
}

export function suggest(index: SuggestIndex, rawQuery: string): SuggestResult {
  const query = rawQuery.trim();
  const out: SuggestResult = { query, terms: [], categories: [] };
  const base = normalizeSearchText(query).replace(/\s+/g, ' ');
  if (base.length < 2) return out;

  // The query as typed first; for Latin input also the Greek spellings
  // («kafes» → «καφεσ»). Greek input is NOT turned into Latin: «γαλα» would
  // otherwise suggest «Galaxy».
  const isLatin = /^[a-z\s]+$/.test(base);
  const variants = isLatin ? [base, ...expandSearch(query).filter((v) => v !== base)] : [base];

  const norms = normalisedTerms(index);
  type Hit = { i: number; tier: number; variant: number };
  const hits: Hit[] = [];
  for (let i = 0; i < norms.length; i++) {
    for (let v = 0; v < variants.length; v++) {
      const tier = matchTier(norms[i], variants[v]);
      if (tier >= 0) {
        hits.push({ i, tier, variant: v === 0 ? 0 : 1 });
        break; // the first (best) variant that matches this term
      }
    }
  }
  // Prefix of the phrase beats prefix of a later word; as-typed beats an
  // alternative spelling; then the most-offered, then the shortest.
  hits.sort(
    (a, b) =>
      a.variant - b.variant ||
      a.tier - b.tier ||
      index.terms[b.i][1] - index.terms[a.i][1] ||
      index.terms[a.i][0].length - index.terms[b.i][0].length ||
      a.i - b.i,
  );

  const taken = new Set<string>();
  for (const h of hits) {
    const [text, count] = index.terms[h.i];
    if (taken.has(norms[h.i])) continue;
    taken.add(norms[h.i]);
    out.terms.push({ text, count });
    if (out.terms.length >= MAX_SUGGESTED_TERMS) break;
  }

  // Departments: those whose own name has a word starting with the query, then
  // those most of the matched phrases live in (weighted by how many offers).
  const deptScore = new Map<number, number>();
  index.departments.forEach((d, i) => {
    if (!d.count) return;
    const words = normalizeSearchText(`${d.id} ${d.label}`).split(/[\s&]+/).filter((w) => w.length >= 3 && !STOP.has(w));
    if (words.some((w) => variants.some((v) => w.startsWith(v)))) deptScore.set(i, Number.MAX_SAFE_INTEGER);
  });
  for (const h of hits.slice(0, 40)) {
    const [, count, dept] = index.terms[h.i];
    if (dept < 0 || deptScore.get(dept) === Number.MAX_SAFE_INTEGER) continue;
    deptScore.set(dept, Math.max(deptScore.get(dept) ?? 0, count));
  }
  const ranked = [...deptScore.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [i, score] of ranked) {
    const d = index.departments[i];
    // A department reached only through phrases must hold a real share of them.
    if (score !== Number.MAX_SAFE_INTEGER && score < 2) continue;
    out.categories.push({ id: d.id, label: d.label, count: score === Number.MAX_SAFE_INTEGER ? d.count : Math.min(score, d.count) });
    if (out.categories.length >= MAX_SUGGESTED_DEPARTMENTS) break;
  }
  return out;
}
