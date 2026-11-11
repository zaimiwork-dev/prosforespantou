// The last offers the shopper opened, on the device. Snapshots, like the
// shopping list: the offer may be gone from the API tomorrow.
import { useSyncExternalStore } from 'react';
import type { DealCard } from './api';
import { createPersistedStore } from './shopping-list';

export type ViewedOffer = {
  id: string;
  productId: string | null;
  name: string;
  chain: string | null;
  price: number;
  imageUrl: string | null;
  viewedAt: number;
};

export const MAX_VIEWED = 20;

// Newest first, one entry per offer id (re-opening moves it to the top), capped.
export function pushViewed(list: ViewedOffer[], entry: ViewedOffer, max = MAX_VIEWED): ViewedOffer[] {
  return [entry, ...list.filter((v) => v.id !== entry.id)].slice(0, max);
}

function sanitize(raw: unknown): ViewedOffer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is ViewedOffer => !!v && typeof v.id === 'string' && typeof v.name === 'string' && Number.isFinite(v.price))
    .slice(0, MAX_VIEWED);
}

const EMPTY: ViewedOffer[] = [];
const store = createPersistedStore<ViewedOffer[]>('prosfores-pantou:recently-viewed:v1', EMPTY, sanitize);

export function recordView(offer: Pick<DealCard, 'id' | 'productId' | 'name' | 'title' | 'chain' | 'price' | 'imageUrl'>) {
  const entry: ViewedOffer = {
    id: offer.id,
    productId: offer.productId,
    name: offer.title || offer.name,
    chain: offer.chain,
    price: offer.price,
    imageUrl: offer.imageUrl,
    viewedAt: Date.now(),
  };
  return store.update((list) => pushViewed(list, entry));
}

export const clearRecentlyViewed = () => store.update(() => []);

export function useRecentlyViewed() {
  const items = useSyncExternalStore(store.subscribe, store.get, store.get);
  const loaded = useSyncExternalStore(store.subscribe, store.isLoaded, store.isLoaded);
  return { items, loaded };
}
