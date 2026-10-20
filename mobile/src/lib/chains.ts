// Chain names, colours and logos come from the server (/api/v1/meta), not a
// copy in the app, so a new chain reaches installed apps without an update.
// Fetched once per app session; cards render the chain id until it arrives.
import { useEffect, useState } from 'react';
import { api, type Chain } from './api';

let cache: Chain[] | null = null;
let inflight: Promise<Chain[]> | null = null;
const listeners = new Set<(c: Chain[]) => void>();

function load(): Promise<Chain[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api
      .meta()
      .then((m) => {
        cache = m.chains;
        listeners.forEach((l) => l(m.chains));
        return m.chains;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useChains(): Chain[] {
  const [chains, setChains] = useState<Chain[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setChains);
    load().catch(() => {});
    return () => {
      listeners.delete(setChains);
    };
  }, []);
  return chains;
}
