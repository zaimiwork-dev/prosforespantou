// Each list item's price at the other chains (GET /api/v1/list-prices), read
// once per list and shared by the store card (components/list-basket-card)
// and the «Πιο φθηνά στο …» tags on the items — same numbers as the website.
import { useEffect, useMemo, useState } from 'react';
import type { ItemPrices } from '@shared/list-basket';
import { api } from './api';
import type { ListItem } from './shopping-list';

export function useListPrices(items: ListItem[]): Record<string, ItemPrices> {
  const [prices, setPrices] = useState<Record<string, ItemPrices>>({});
  // Sorted, so the same list asks the same (edge-cached) URL.
  const idsKey = useMemo(() => [...new Set(items.map((i) => i.id))].sort().join(','), [items]);
  useEffect(() => {
    if (!idsKey) return undefined;
    const ctrl = new AbortController();
    api.listPrices(idsKey.split(','), ctrl.signal)
      .then((r) => setPrices(r.items ?? {}))
      // Offline or a server error: no card and no tags; the list itself works.
      .catch(() => {});
    return () => ctrl.abort();
  }, [idsKey]);
  return prices;
}
