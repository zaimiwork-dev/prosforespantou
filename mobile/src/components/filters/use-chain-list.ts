// Reads useChains() whatever shape it has. The home engineer is adding
// `error` / `retry` to it (APP-402); until that lands it is a plain Chain[].
// This adapter accepts both the array form (with extra properties) and an
// object form ({ chains, error, retry }) so the screens compile either way.
import { useChains } from '@/lib/chains';
import type { Chain } from '@/lib/api';

export function useChainList(): { chains: Chain[]; failed: boolean; retry: (() => void) | null } {
  const c: unknown = useChains();
  let chains: Chain[] = [];
  if (Array.isArray(c)) chains = c as Chain[];
  else if (c && typeof c === 'object' && Array.isArray((c as { chains?: unknown }).chains)) chains = (c as { chains: Chain[] }).chains;
  const o = (c && typeof c === 'object' ? c : {}) as { error?: unknown; retry?: unknown };
  const failed = 'error' in o && !!o.error && chains.length === 0;
  const retry = typeof o.retry === 'function' ? (o.retry as () => void) : null;
  return { chains, failed, retry };
}
