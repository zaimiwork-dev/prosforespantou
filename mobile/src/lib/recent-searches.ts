// Recent searches survive app restarts. Newest first, at most 10, a repeat
// (in any letter case) moves to the front instead of appearing twice.
import { useSyncExternalStore } from 'react';
import { createPersistedStore } from './shopping-list';

const MAX = 10;

function sanitize(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string').slice(0, MAX) : [];
}

const EMPTY: string[] = [];
const store = createPersistedStore<string[]>('prosfores-pantou:recent-searches:v1', EMPTY, sanitize);

export function rememberSearch(text: string) {
  const t = text.trim();
  if (!t) return Promise.resolve();
  const lower = t.toLocaleLowerCase('el-GR');
  return store.update((list) => [t, ...list.filter((r) => r.toLocaleLowerCase('el-GR') !== lower)].slice(0, MAX));
}

export const clearRecentSearches = () => store.update(() => []);

export function useRecentSearches(): string[] {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
