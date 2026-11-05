// Chain names, colours and logos come from the server (/api/v1/meta), not a
// copy in the app, so a new chain reaches installed apps without an update.
// Fetched once per app session; cards render the chain id until it arrives.
// A failed fetch is surfaced (error + retry) instead of swallowed, so screens
// can stop showing «Φόρτωση…» forever.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { api, type Chain, type MetaResponse } from './api';

// An immutable snapshot, replaced on every change: React (and the React
// Compiler) only notice a store change when the snapshot object is new.
type Snapshot = { meta: MetaResponse | null; failed: boolean };
let snap: Snapshot = { meta: null, failed: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Snapshot) {
  snap = next;
  listeners.forEach((l) => l());
}

function load(): Promise<void> {
  if (snap.meta) return Promise.resolve();
  if (!inflight) {
    inflight = api
      .meta()
      .then((meta) => set({ meta, failed: false }))
      .catch(() => set({ meta: null, failed: true }))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => snap;

export type MetaState = {
  meta: MetaResponse | null;
  error: boolean;
  retry: () => void;
};

export function useMeta(): MetaState {
  const { meta, failed } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void load();
  }, []);
  const retry = useCallback(() => {
    if (snap.failed) set({ meta: null, failed: false });
    void load();
  }, []);
  return { meta, error: failed, retry };
}

// Still an array of chains for existing callers; `error` and `retry` ride
// along as extra properties so nothing had to be renamed.
export type ChainList = Chain[] & { error: boolean; retry: () => void };

export function useChains(): ChainList {
  const { meta, error, retry } = useMeta();
  const chains = meta?.chains;
  return useMemo(() => Object.assign([...(chains ?? [])], { error, retry }), [chains, error, retry]);
}
