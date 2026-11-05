// Favourite products ("my staples"), on the device. Same store pattern as the
// shopping list; keyed like the website so a product means the same thing in both.
import { useSyncExternalStore } from 'react';
import type { DealCard } from './api';
import { track } from './analytics';
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

export function toggleFavourite(offer: Pick<DealCard, 'id' | 'productId' | 'name' | 'title' | 'chain'>) {
  const key = favouriteKeyFor(offer);
  let added = false;
  return store
    .update((favs) => {
      added = !favs.some((f) => f.key === key);
      return added
        ? [...favs, { key, productId: offer.productId, name: offer.title || offer.name, chain: offer.chain }]
        : favs.filter((f) => f.key !== key);
    })
    .then(() => track(added ? 'favorite' : 'unfavorite', { discountId: offer.id, supermarket: offer.chain ?? undefined }));
}

export function removeFavourite(key: string) {
  let gone: Favourite | undefined;
  return store
    .update((favs) => {
      gone = favs.find((f) => f.key === key);
      return favs.filter((f) => f.key !== key);
    })
    .then(() => {
      if (gone) track('unfavorite', { supermarket: gone.chain ?? undefined });
    });
}

export function useFavourites() {
  const favourites = useSyncExternalStore(store.subscribe, store.get, store.get);
  const loaded = useSyncExternalStore(store.subscribe, store.isLoaded, store.isLoaded);
  return { favourites, loaded };
}
