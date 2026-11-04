// Favourite products ("my staples"), on the device. Same store pattern as the
// shopping list; keyed like the website so a product means the same thing in both.
import { useSyncExternalStore } from 'react';
import type { DealCard } from './api';
import { createPersistedStore } from './shopping-list';

export type Favourite = {
  key: string;
  productId: string | null;
  name: string;
  chain: string | null;
};

// Copied from favoriteKeyFor() in src/lib/store.ts (that file imports zustand
// and localStorage, which must not enter the app bundle). Keep the two rules
// identical: the canonical productId when the offer is matched, else name+chain.
export function favouriteKeyFor(offer: { productId?: string | null; name?: string | null; chain?: string | null }): string {
  if (offer.productId) return `p:${offer.productId}`;
  return `n:${(offer.name ?? '').toLowerCase()}|${offer.chain ?? ''}`;
}

function sanitize(raw: unknown): Favourite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is Favourite => !!f && typeof f.key === 'string' && typeof f.name === 'string');
}

const EMPTY: Favourite[] = [];
const store = createPersistedStore<Favourite[]>('prosfores-pantou:favourites:v1', EMPTY, sanitize);

export function toggleFavourite(offer: Pick<DealCard, 'productId' | 'name' | 'title' | 'chain'>) {
  const key = favouriteKeyFor(offer);
  return store.update((favs) =>
    favs.some((f) => f.key === key)
      ? favs.filter((f) => f.key !== key)
      : [...favs, { key, productId: offer.productId, name: offer.title || offer.name, chain: offer.chain }],
  );
}

export const removeFavourite = (key: string) => store.update((favs) => favs.filter((f) => f.key !== key));

export function useFavourites() {
  const favourites = useSyncExternalStore(store.subscribe, store.get, store.get);
  const loaded = useSyncExternalStore(store.subscribe, store.isLoaded, store.isLoaded);
  return { favourites, loaded };
}
