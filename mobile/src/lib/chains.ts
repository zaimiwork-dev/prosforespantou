// Chain names, colours and logos come from the server (/api/v1/meta), not a
// copy in the app, so a new chain reaches installed apps without an update.
// Cached on the device (useApi), so it is there offline; cards render the chain
// id until it arrives. A failed fetch with nothing cached is surfaced (error +
// retry), so screens can stop showing «Φόρτωση…» forever.
import { useMemo } from 'react';
import { api, type Chain, type MetaResponse } from './api';
import { useApi } from './use-api';

export type MetaState = {
  meta: MetaResponse | null;
  // True only when there is nothing to show (a stale copy is not an error here;
  // screens that want to say so read useApi('meta') / the stale banner).
  error: boolean;
  retry: () => void;
};

// Chains and categories change once a week: a long ttl keeps the strip stable
// and saves requests; the cached copy still serves offline at any age.
const META_TTL_MS = 30 * 60 * 1000;
const fetchMeta = (signal: AbortSignal) => api.meta(signal);

export function useMeta(): MetaState {
  const { data, error, refresh } = useApi('meta', fetchMeta, { ttlMs: META_TTL_MS });
  return { meta: data ?? null, error: error && !data, retry: refresh };
}

// Still an array of chains for existing callers; `error` and `retry` ride
// along as extra properties so nothing had to be renamed.
export type ChainList = Chain[] & { error: boolean; retry: () => void };

export function useChains(): ChainList {
  const { meta, error, retry } = useMeta();
  const chains = meta?.chains;
  return useMemo(() => Object.assign([...(chains ?? [])], { error, retry }), [chains, error, retry]);
}
