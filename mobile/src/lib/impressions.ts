// «Seen» statistics: an offer counts once a card has been at least half on
// screen for a full second. Cards are queued and sent in batches so scrolling
// costs one small request per few seconds, not one per card.
//
// Same consent gate as analytics.ts: nothing is queued or sent unless the
// shopper accepted. The endpoint may not exist yet (404) — failures are silent.
import { useState } from 'react';
import { API_BASE, type DealCard } from './api';
import { sessionId } from './analytics';
import { getSettings } from './settings';

// FlatList's ViewToken, reduced to what we read (react-native does not export it).
type Viewable = { item?: DealCard; index?: number | null; isViewable: boolean };

export type ImpressionItem = { discountId: string; supermarket?: string; page: string; position?: number };

export const FLUSH_MS = 5000;
export const FLUSH_COUNT = 20;

// Pure core, injectable for tests: de-dupes per page per session and decides
// when to flush; `send` does the network.
export function createImpressionQueue(send: (items: ImpressionItem[]) => void, allowed: () => boolean) {
  const seen = new Set<string>();
  let queue: ImpressionItem[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = queue;
    queue = [];
    if (batch.length && allowed()) send(batch);
  };

  return {
    add(item: ImpressionItem) {
      if (!allowed()) return;
      const key = `${item.page}|${item.discountId}`;
      if (seen.has(key)) return;
      seen.add(key);
      queue.push(item);
      if (queue.length >= FLUSH_COUNT) flush();
      else if (!timer) timer = setTimeout(flush, FLUSH_MS);
    },
    flush,
    pending: () => queue.length,
  };
}

async function post(items: ImpressionItem[]) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const id = await sessionId();
    if (getSettings().consent !== 'accepted') return;
    await fetch(`${API_BASE}/api/v1/impressions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(id ? { sessionId: id } : {}), items }),
      signal: ctrl.signal,
    });
  } catch {
    /* fire-and-forget */
  } finally {
    clearTimeout(timer);
  }
}

const queue = createImpressionQueue((items) => void post(items), () => getSettings().consent === 'accepted');

// FlatList throws if these change between renders, so they are created once.
// minimumViewTime does the one-second dwell for us.
const viewabilityConfig = { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 } as const;

export function useImpressionTracker(page: string) {
  // `page` is fixed per list; created once because FlatList rejects changing handlers.
  const [tracker] = useState(() => ({
    viewabilityConfig,
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: Viewable[] }) => {
      for (const v of viewableItems) {
        if (!v.isViewable || !v.item?.id) continue;
        queue.add({ discountId: v.item.id, supermarket: v.item.chain ?? undefined, page, position: v.index ?? undefined });
      }
    },
  }));
  return tracker;
}

// For a screen going to the background: don't hold seen cards for 5 s.
export const flushImpressions = () => queue.flush();
