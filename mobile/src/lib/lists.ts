// List post-processing shared with the website (src/lib): the site runs
// these in the browser over the rows it has loaded, so the app does the same
// over its accumulated cards — same order, same duplicates removed.
import { dedupeDeals } from '@shared/dedupe-deals';
import type { DealCard } from './api';

// The shared helpers speak the database field names; the card uses shorter
// ones. Wrap, process, unwrap — the card objects themselves pass through.
type Wrapped = DealCard & { productName: string; supermarket: string | null; discountedPrice: number };
const wrap = (c: DealCard): Wrapped => ({ ...c, productName: c.name, supermarket: c.chain, discountedPrice: c.price });
const unwrap = ({ productName: _n, supermarket: _s, discountedPrice: _p, ...c }: Wrapped): DealCard => c;

export function dedupeCards(cards: DealCard[]): DealCard[] {
  return dedupeDeals(cards.map(wrap)).map(unwrap);
}
