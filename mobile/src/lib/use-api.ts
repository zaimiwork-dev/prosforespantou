// useApi — one way for a screen to load server data and survive bad signal:
// the last good answer (memory, then disk) is shown at once, refreshed in the
// background when older than ttl, and kept on screen — flagged `stale` — if the
// refresh fails. All state lives in the cache store (see cache.ts) and is read
// through useSyncExternalStore, so it is correct under the React Compiler.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { DEFAULT_TTL_MS, IDLE, fetchKey, getState, hydrate, isFresh, subscribe } from './cache';

export type ApiState<T> = {
  data: T | undefined;
  // The last request failed (with or without data to show).
  error: boolean;
  // No data yet and a request is pending (or the key is not hydrated yet).
  loading: boolean;
  // Showing cached data although the latest refresh failed.
  stale: boolean;
  // When `data` was fetched (ms epoch), for «τελευταία ενημέρωση».
  updatedAt: number | null;
  // A refresh() is running (pull-to-refresh spinner).
  refreshing: boolean;
  refresh: () => void;
};

export function useApi<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  opts: { ttlMs?: number } = {},
): ApiState<T> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const subscribeKey = useCallback((l: () => void) => (key === null ? () => {} : subscribe(key, l)), [key]);
  const getSnapshot = useCallback(() => (key === null ? IDLE : getState(key)), [key]);
  const state = useSyncExternalStore(subscribeKey, getSnapshot, getSnapshot);

  // The latest fetcher, for refresh() and the effect, without re-running the
  // effect each render (screens pass an inline function).
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const releases = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    const held = releases.current;
    void hydrate(key).then(() => {
      if (cancelled) return;
      if (isFresh(getState(key).entry, ttlMs, Date.now())) return;
      held.add(fetchKey(key, (s) => fetcherRef.current(s)));
    });
    return () => {
      cancelled = true;
      held.forEach((release) => release());
      held.clear();
    };
  }, [key, ttlMs]);

  const refresh = useCallback(() => {
    if (key === null) return;
    releases.current.add(fetchKey(key, (s) => fetcherRef.current(s), { manual: true }));
  }, [key]);

  const entry = state.entry as { data: T; fetchedAt: number } | undefined;
  return {
    data: entry?.data,
    error: state.error,
    loading: key !== null && !entry && !state.error,
    stale: !!entry && state.error,
    updatedAt: entry?.fetchedAt ?? null,
    refreshing: state.refreshing,
    refresh,
  };
}
