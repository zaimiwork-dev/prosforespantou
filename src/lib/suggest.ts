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
// phrases; neither do the chains' abbreviations («ΖΥΜ.», a capitals-only «ΣΑΜΠ»)
// or words mixing Greek and Latin letters. The list is capped (MAX_TERMS,
// most-offered first) so the cached entry stays small whatever the catalogue
// grows to.
//
// Counts are offers, not searches, so suggest() corrects two things a Greek
// reader notices at once: a base word goes before a more common form that only
// extends it («Γάλα» before «Γάλακτος»), and a noun is listed in one case
// («Κοτόπουλο», not also «Κοτόπουλου»). Measured on the live catalogue 11-13.
//
// Pure + strip-safe (no enums/decorators): imported by a server action and by
// vitest; the only dependencies are the search normaliser and the categorizer
// so matching agrees with the search itself (accents, final sigma, greeklish).

import { expandSearch, normalizeSearchText } from './search-rank.ts';
import { DEPARTMENTS } from './categories.ts';

export const MAX_TERMS = 6000;
export const MAX_SUGGESTED_TERMS = 8;
export const MAX_SUGGESTED_DEPARTMENTS = 3;
// A capitals-only word of at most this many letters is a truncation when a
// longer word starting with it is this many times more common.
const TRUNCATION_MAX_LEN = 5;
const TRUNCATION_RATIO = 5;
// «Γάλα» (123 offers) goes before «Γάλακτος» (175): a word the other merely
// extends — by an ending, not by another word («Πάνα» / «Πανάρισμα») — comes
// first while it is at least a quarter as common.
const BASE_FIRST_RATIO = 4;
const BASE_FIRST_MAX_EXTRA = 4;
const BASE_FIRST_WINDOW = 60;
// A phrase «lives in» a department only when most of its offers are there.
// «Φέτα» is in frozen pies, sauces and fish fillets as much as in cheese:
// naming one aisle for it would be a guess.
const DEPARTMENT_SHARE_MIN = 0.6;

// [display text, offers containing it, index into SuggestIndex.departments of
// the department at least DEPARTMENT_SHARE_MIN of those offers are in (-1 = none)]
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
const LEAD_EDGE_RE = /^[^\p{L}\p{N}]+/u;
// «ΖΥΜ.», «ΣΑΜΠ.», «ΕΠΙΚ.»: a chain's abbreviation, not a word to suggest.
const ABBREV_RE = /\p{L}\.$/u;

function wordsOf(name: string): string[] {
  // Tokens that are not plain words (sizes, prices, «3x500γρ», «&») end the
  // phrase-able prefix but are skipped for unigrams — see buildSuggestIndex.
  // An abbreviation keeps its dot so it is treated the same way.
  return name
    .split(/\s+/)
    .map((t) => (ABBREV_RE.test(t) ? t.replace(LEAD_EDGE_RE, '') : t.replace(CLEAN_EDGE_RE, '')))
    .filter(Boolean);
}

const isShouted = (raw: string) => raw === raw.toUpperCase() && raw !== raw.toLowerCase();

// Greek and Latin letters in one word are a data-entry slip («Σαμπoyan», «ΧΧL»
// typed with Greek Χ): the right spelling exists as its own phrase.
const GREEK_RE = /\p{Script=Greek}/u;
const LATIN_RE = /\p{Script=Latin}/u;
const isPlainWord = (t: string) => WORD_RE.test(t) && !(GREEK_RE.test(t) && LATIN_RE.test(t));

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
  const shouted = isShouted(raw);
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
      if (!isPlainWord(t) || t.length < 3) continue;
      const key = normalizeSearchText(t);
      if (STOP.has(key) || seen.has(key)) continue;
      seen.add(key);
      bump(acc, key, t, dept);
    }

    // Leading phrases: the first 2 and 3 words, as long as they are plain words.
    const lead: string[] = [];
    for (const t of tokens) {
      if (!isPlainWord(t)) break;
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
  // They add one to the count, not the department's size: a word like
  // «Φροντίδα» must not outrank the products people actually look for. Their
  // own spelling (with accents) wins over a shouted spelling from a name.
  deptIds.forEach((id, i) => {
    if (!deptCount[i]) return;
    for (const w of id.split(/\s+/)) {
      const clean = w.replace(CLEAN_EDGE_RE, '');
      const key = normalizeSearchText(clean);
      if (clean.length < 4 || STOP.has(key)) continue;
      bump(acc, key, clean, i);
      const a = acc.get(key)!;
      a.forms.set(clean, (a.forms.get(clean) ?? 0) + 1_000_000);
    }
  });

  // Truncations written without a dot («ULTREX ΣΑΜΠ DEEP CLEAN», «ΣΑΚ ΑΠΟΡ»):
  // a short word only ever seen in capitals that a far more common word starts
  // with. Both conditions are needed — «Μέλι» is short and «Μέλισσα» is more
  // common, but «Μέλι» is also written in normal case, so it stays.
  const longerMax = new Map<string, number>();
  for (const [key, a] of acc) {
    if (key.includes(' ')) continue;
    for (let p = 3; p <= TRUNCATION_MAX_LEN && p < key.length; p++) {
      const pre = key.slice(0, p);
      if ((longerMax.get(pre) ?? 0) < a.count) longerMax.set(pre, a.count);
    }
  }
  const truncated = new Set<string>();
  for (const [key, a] of acc) {
    if (key.includes(' ') || key.length > TRUNCATION_MAX_LEN) continue;
    if ((longerMax.get(key) ?? 0) < a.count * TRUNCATION_RATIO) continue;
    if ([...a.forms.keys()].every(isShouted)) truncated.add(key);
  }

  const terms: SuggestTerm[] = [];
  for (const [key, a] of acc) {
    if (truncated.has(key) || (key.includes(' ') && key.split(' ').some((w) => truncated.has(w)))) continue;
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
    if (domN < a.count * DEPARTMENT_SHARE_MIN) dom = -1;
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
  const hits: RankedHit[] = [];
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

  const taken: number[] = [];
  const seen = new Set<string>();
  for (const h of baseFirst(hits, norms, index.terms)) {
    const norm = norms[h.i];
    if (seen.has(norm)) continue;
    // «Κοτόπουλου» under «Κοτόπουλο» is the same search in another case.
    if (isWord(norm) && taken.some((j) => isWord(norms[j]) && sameWordOtherCase(norms[j], norm))) continue;
    seen.add(norm);
    taken.push(h.i);
    const [text, count] = index.terms[h.i];
    out.terms.push({ text, count });
    if (out.terms.length >= MAX_SUGGESTED_TERMS) break;
  }

  // Departments: those whose own name has a word starting with the query, then
  // the ONE department the first suggestion lives in. Not every department a
  // matching phrase touches: «γάλα» also reaches «Γαλάκτωμα», and a row «σε
  // Προσωπική Φροντίδα» opens an aisle the shopper did not ask for.
  const named: number[] = [];
  index.departments.forEach((d, i) => {
    if (!d.count) return;
    const words = normalizeSearchText(`${d.id} ${d.label}`).split(/[\s&]+/).filter((w) => w.length >= 3 && !STOP.has(w));
    if (words.some((w) => variants.some((v) => w.startsWith(v)))) named.push(i);
  });
  for (const i of named.slice(0, MAX_SUGGESTED_DEPARTMENTS)) {
    const d = index.departments[i];
    out.categories.push({ id: d.id, label: d.label, count: d.count });
  }
  if (taken.length > 0 && out.categories.length < MAX_SUGGESTED_DEPARTMENTS) {
    const [, count, dept] = index.terms[taken[0]];
    // One offer is not «where this lives».
    if (dept >= 0 && count >= 2 && !named.includes(dept)) {
      const d = index.departments[dept];
      out.categories.push({ id: d.id, label: d.label, count: Math.min(count, d.count) });
    }
  }
  return out;
}

const isWord = (norm: string) => !norm.includes(' ');

// Case endings a Greek noun takes without becoming another product: «Κοτόπουλο /
// Κοτόπουλου», «Φρούτα / Φρούτων», «Γιαούρτι / Γιαουρτιού», «Σοκολάτα /
// Σοκολάτας», «Τόνος / Τόνο». Number is NOT folded: «Φέτα» (the cheese) and
// «Φέτες» (slices) are different searches. Works on normalised text (no
// accents, final sigma as σ); Latin words have none of these endings.
const ENDINGS = ['ιου', 'ιων', 'ου', 'ων', 'οσ', 'ασ', 'ησ', 'εσ', 'ια', 'α', 'ο', 'η', 'ι', 'ε', 'υ'];
const GENITIVE = new Set(['ιου', 'ιων', 'ου', 'ων']);

function stemOf(norm: string): [string, string] {
  for (const e of ENDINGS) {
    if (norm.length - e.length >= 3 && norm.endsWith(e)) return [norm.slice(0, -e.length), e];
  }
  return [norm, ''];
}

export function sameWordOtherCase(a: string, b: string): boolean {
  if (a === b) return false;
  if (a + 'σ' === b || b + 'σ' === a) return true;
  const [stemA, endA] = stemOf(a);
  const [stemB, endB] = stemOf(b);
  return stemA === stemB && (GENITIVE.has(endA) || GENITIVE.has(endB));
}

type RankedHit = { i: number; tier: number; variant: number };

// Counts come from offer names, not from what people search, so an inflected
// form can outnumber its own base word: «Γάλακτος» (every milk chocolate) beats
// «Γάλα». Within the leading hits, a single word that another merely extends is
// moved in front of it when it is about as common (BASE_FIRST_RATIO).
function baseFirst(hits: RankedHit[], norms: string[], terms: SuggestTerm[]): RankedHit[] {
  const head = hits.slice(0, BASE_FIRST_WINDOW);
  const placed = new Array<boolean>(head.length).fill(false);
  const out: RankedHit[] = [];
  for (let a = 0; a < head.length; a++) {
    if (placed[a]) continue;
    const long = head[a];
    const longNorm = norms[long.i];
    if (isWord(longNorm)) {
      const bases: number[] = [];
      for (let b = a + 1; b < head.length; b++) {
        if (placed[b]) continue;
        const short = head[b];
        const shortNorm = norms[short.i];
        if (short.variant !== long.variant || short.tier !== long.tier || !isWord(shortNorm)) continue;
        const extra = longNorm.length - shortNorm.length;
        if (extra < 1 || extra > BASE_FIRST_MAX_EXTRA || !longNorm.startsWith(shortNorm)) continue;
        if (terms[short.i][1] * BASE_FIRST_RATIO >= terms[long.i][1]) bases.push(b);
      }
      bases.sort((x, y) => norms[head[x].i].length - norms[head[y].i].length);
      for (const b of bases) {
        out.push(head[b]);
        placed[b] = true;
      }
    }
    out.push(long);
    placed[a] = true;
  }
  return hits.length > head.length ? out.concat(hits.slice(head.length)) : out;
}
