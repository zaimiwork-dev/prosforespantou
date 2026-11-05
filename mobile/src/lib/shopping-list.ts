// The shopping list lives on the device (no login). A module-level store: loaded
// from AsyncStorage once, written through on every change, read in components
// with useShoppingList() — no context provider, so no root layout is involved.
// Behaviour mirrors the website's store (src/lib/store.ts): adding an offer that
// is already listed raises its quantity; lowering the last unit removes it.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DealCard } from './api';
import { track } from './analytics';

const KEY = 'prosfores-pantou:list:v1';
// Same origin the share text of the website ends with.
const SITE_ORIGIN = 'https://prosforespantou.gr';

// A snapshot of the offer taken when it was added: the offer may be gone from
// the API days later, but the list must still show what the shopper saw.
export type ListItem = {
  id: string;
  productId: string | null;
  name: string;
  chain: string | null;
  price: number;
  imageUrl: string | null;
  validUntil: string;
  // False when validUntil is our ingest default, not a date the chain
  // published (DealCard contract): such an offer is never shown as ended.
  datesFromSource: boolean;
  quantity: number;
  checked: boolean;
};

// Small persisted store shared by list, favourites and recent searches
// (the three files are the only users, so it is exported from here).
export function createPersistedStore<T>(storageKey: string, empty: T, sanitize: (raw: unknown) => T) {
  let state: T = empty;
  let loaded = false;
  const listeners = new Set<() => void>();
  const ready: Promise<void> = AsyncStorage.getItem(storageKey)
    .then((raw) => {
      // Anything changed before the read finished wins over the stale disk copy.
      if (raw && state === empty) state = sanitize(JSON.parse(raw));
    })
    .catch(() => {
      // Corrupt or unreadable storage: start empty rather than crash the screen.
    })
    .then(() => {
      loaded = true;
      listeners.forEach((l) => l());
    });

  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };

  return {
    subscribe,
    get: () => state,
    isLoaded: () => loaded,
    // Mutations wait for the first read so a quick tap cannot be overwritten by it.
    update(fn: (s: T) => T) {
      return ready.then(() => {
        state = fn(state);
        listeners.forEach((l) => l());
        return AsyncStorage.setItem(storageKey, JSON.stringify(state)).catch(() => {});
      });
    },
  };
}

function sanitize(raw: unknown): ListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is ListItem => !!i && typeof i.id === 'string' && typeof i.name === 'string' && Number.isFinite(i.price),
  );
}

const EMPTY: ListItem[] = [];
const store = createPersistedStore<ListItem[]>(KEY, EMPTY, sanitize);

// One statistic per offer that really left the list (the website counts the
// same way); emitted after the write, from what the updater actually removed.
const trackRemoved = (gone: ListItem[]) =>
  gone.forEach((i) => track('list_remove', { discountId: i.id, supermarket: i.chain ?? undefined }));

export function addToList(offer: Pick<DealCard, 'id' | 'productId' | 'name' | 'title' | 'chain' | 'price' | 'imageUrl' | 'validUntil' | 'datesFromSource'>, quantity = 1) {
  track('list_add', { discountId: offer.id, supermarket: offer.chain ?? undefined });
  return store.update((items) => {
    if (items.some((i) => i.id === offer.id)) {
      return items.map((i) => (i.id === offer.id ? { ...i, quantity: i.quantity + quantity } : i));
    }
    return [
      ...items,
      {
        id: offer.id,
        productId: offer.productId,
        name: offer.title || offer.name,
        chain: offer.chain,
        price: offer.price,
        imageUrl: offer.imageUrl,
        validUntil: offer.validUntil,
        datesFromSource: offer.datesFromSource,
        quantity,
        checked: false,
      },
    ];
  });
}

export function removeFromList(id: string) {
  let gone: ListItem[] = [];
  return store
    .update((items) => {
      gone = items.filter((i) => i.id === id);
      return items.filter((i) => i.id !== id);
    })
    .then(() => trackRemoved(gone));
}

export function changeQuantity(id: string, delta: number) {
  let gone: ListItem[] = [];
  return store
    .update((items) => {
      const next = items.map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i));
      gone = next.filter((i) => i.quantity <= 0);
      return next.filter((i) => i.quantity > 0);
    })
    .then(() => trackRemoved(gone));
}

export const toggleChecked = (id: string) =>
  store.update((items) => items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));

export function removeChecked() {
  let gone: ListItem[] = [];
  return store
    .update((items) => {
      gone = items.filter((i) => i.checked);
      return items.filter((i) => !i.checked);
    })
    .then(() => trackRemoved(gone));
}

export const isExpired = (item: Pick<ListItem, 'validUntil' | 'datesFromSource'>, now = Date.now()) => {
  if (!item.datesFromSource) return false;
  const t = new Date(item.validUntil).getTime();
  return Number.isFinite(t) && t < now;
};

export type ChainGroup = { chain: string | null; items: ListItem[]; subtotal: number };

// Per chain, biggest subtotal first (as on the website). An expired offer is
// listed but not counted: its price can no longer be paid.
export function groupByChain(items: ListItem[], now = Date.now()): { groups: ChainGroup[]; total: number } {
  const map = new Map<string | null, ChainGroup>();
  for (const item of items) {
    let g = map.get(item.chain);
    if (!g) {
      g = { chain: item.chain, items: [], subtotal: 0 };
      map.set(item.chain, g);
    }
    g.items.push(item);
    if (!isExpired(item, now)) g.subtotal += item.price * item.quantity;
  }
  const groups = [...map.values()].sort((a, b) => b.subtotal - a.subtotal);
  return { groups, total: groups.reduce((s, g) => s + g.subtotal, 0) };
}

// Same wording and layout as getShareText() on the website (decimal point and
// all, so a list shared from the app reads like one shared from the site).
export function buildShareText(items: ListItem[], shortOf: (chain: string | null) => string): string {
  const live = items.filter((i) => !isExpired(i));
  if (live.length === 0) return '';
  const total = live.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2);
  const lines = live
    .map((i) => `• ${i.quantity}x ${i.name} (${shortOf(i.chain)}) - ${(i.price * i.quantity).toFixed(2)}€`)
    .join('\n');
  return `ΠΡΟΣΦΟΡΕΣ ΠΑΝΤΟΥ — Η λίστα μου

${lines}

Σύνολο: ${total}€

Δες περισσότερα στο: ${SITE_ORIGIN}`;
}

export function useShoppingList() {
  const items = useSyncExternalStore(store.subscribe, store.get, store.get);
  const loaded = useSyncExternalStore(store.subscribe, store.isLoaded, store.isLoaded);
  return { items, loaded };
}
