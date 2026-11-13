// Pure logic of the search screen: facets counted from the results themselves,
// the sort pill, and splitting a suggestion into plain / bold parts. Kept out of
// the screen so it can be unit-tested (no react-native in here).
import type { DealCard } from '@/lib/api';

export type SortKey = 'relevance' | 'price' | 'unit';

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Σχετικότητα',
  price: 'Φθηνότερο',
  unit: 'Φθηνότερο ανά κιλό/λίτρο',
};
export const SORT_ORDER: SortKey[] = ['relevance', 'price', 'unit'];
export const nextSort = (s: SortKey): SortKey => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length];

export type Facet = { id: string; count: number };

// Biggest first; ties keep the order they first appear in (the server's relevance).
function countBy(deals: DealCard[], pick: (d: DealCard) => string | null | undefined): Facet[] {
  const counts = new Map<string, number>();
  for (const d of deals) {
    const id = pick(d);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

export const chainFacets = (deals: DealCard[]): Facet[] => countBy(deals, (d) => d.chain);

// «Άλλο» is not a place to browse; never offer it as a narrowing chip.
export const departmentFacets = (deals: DealCard[], max = 4): Facet[] =>
  countBy(deals, (d) => (d.category && d.category !== 'Άλλο' ? d.category : null)).slice(0, max);

export type Selection = { chains: string[]; categories: string[] };
export const NO_SELECTION: Selection = { chains: [], categories: [] };
export const hasSelection = (s: Selection) => s.chains.length > 0 || s.categories.length > 0;

export function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// Within one group the choices add up (AB or Lidl); the two groups narrow each other.
export function applyFacets(deals: DealCard[], s: Selection): DealCard[] {
  if (!hasSelection(s)) return deals;
  return deals.filter(
    (d) =>
      (s.chains.length === 0 || (d.chain != null && s.chains.includes(d.chain))) &&
      (s.categories.length === 0 || s.categories.includes(d.category)),
  );
}

// Only €/κιλό and €/λίτρο are comparable across products; a per-dose or
// per-piece price is not, so those rows go last like rows with no unit price.
function perKiloOrLitre(d: DealCard): number | null {
  const u = d.unit;
  return u && (u.per === 'κιλό' || u.per === 'λίτρο') && Number.isFinite(u.value) ? u.value : null;
}

// Stable: equal keys keep the server's order. Returns a new array.
export function sortDeals(deals: DealCard[], sort: SortKey): DealCard[] {
  if (sort === 'relevance') return deals;
  const keyed = deals.map((d, i) => ({ d, i, k: sort === 'price' ? d.price : perKiloOrLitre(d) }));
  keyed.sort((a, b) => {
    if (a.k === null && b.k === null) return a.i - b.i;
    if (a.k === null) return 1;
    if (b.k === null) return -1;
    return a.k - b.k || a.i - b.i;
  });
  return keyed.map((x) => x.d);
}

// ---- highlight ----

// One character at a time so indexes of the folded text map straight back to the
// original (NFD would change lengths): lower case, final sigma → σ, accents off.
function fold(ch: string): string {
  return ch.toLowerCase().replace(/ς/g, 'σ').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export type Part = { text: string; bold: boolean };

// «Nescafe Classic», typed «nesc» → [«Nesc» bold][«afe Classic»]. The typed text
// is found at the start of the phrase or of a later word, ignoring accents and
// final sigma. No match (e.g. a greeklish query) → one plain part.
export function splitHighlight(text: string, typed: string): Part[] {
  const q = [...typed.trim()].map(fold).join('').replace(/\s+/g, ' ');
  if (q.length === 0) return [{ text, bold: false }];

  const chars = [...text];
  let folded = '';
  const start: number[] = []; // start[k] = index in `chars` of the char that produced folded[k]
  chars.forEach((c, i) => {
    const f = fold(c);
    for (let j = 0; j < f.length; j++) {
      folded += f[j];
      start.push(i);
    }
  });

  let at = -1;
  for (let k = folded.indexOf(q); k !== -1; k = folded.indexOf(q, k + 1)) {
    if (k === 0 || folded[k - 1] === ' ') {
      at = k;
      break;
    }
  }
  if (at === -1) return [{ text, bold: false }];

  const from = start[at];
  const last = start[at + q.length - 1];
  const to = last + 1;
  const parts: Part[] = [];
  const slice = (a: number, b: number) => chars.slice(a, b).join('');
  if (from > 0) parts.push({ text: slice(0, from), bold: false });
  parts.push({ text: slice(from, to), bold: true });
  if (to < chars.length) parts.push({ text: slice(to, chars.length), bold: false });
  return parts;
}
