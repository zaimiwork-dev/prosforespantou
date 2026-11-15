// Client for the app API (/api/v1/…, src/app/api/v1 in the website repo).
// The response types are imported from the server's own contract file, so a
// field rename there fails this app's type-check instead of a phone.
import type { DealCard } from '@shared/api/deal-card';
import type { PriceTimeline } from '@shared/price-timeline';

export type { DealCard, PriceTimeline };

// EXPO_PUBLIC_API_URL points a dev build at a preview deployment or a local
// server (e.g. http://192.168.1.20:3000); production builds use the live site.
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://prosforespantou.gr').replace(/\/+$/, '');

export type HomeResponse = {
  total: number;
  counts: { bySupermarket: Record<string, number>; byCategory: Record<string, number> };
  essentials: DealCard[];
  top: DealCard[];
  endingSoon: DealCard[];
};

export type Chain = {
  id: string;
  name: string;
  short: string;
  color: string;
  bg: string;
  logoUrl: string | null;
  leafletUrl: string | null;
  offers: number;
};

export type MetaResponse = {
  chains: Chain[];
  categories: { id: string; label: string; full: string; offers: number }[];
  total: number;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Bad signal in a shop: a request that hangs must end as an error the screen can
// show (or fall back from), not spin forever. AbortSignal.any/timeout exist in
// Hermes on RN 0.88 (checked in react-native's AbortSignal.js) and in browsers.
export const REQUEST_TIMEOUT_MS = 15_000;

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, { signal: combined, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new ApiError(res.status, `${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    // The caller's own cancellation stays an abort; only our timer is an ApiError.
    if (!(e instanceof ApiError) && timeout.aborted && !signal?.aborted) throw new ApiError(0, `${path} → timeout`);
    throw e;
  }
}

export type DealSort = 'hot' | 'expiring' | 'discount' | 'newest' | 'price_asc' | 'price_desc';

export type DealsQuery = {
  limit?: number;
  offset?: number;
  // One id or several: the server ranks and pages `chain=ab,lidl` as ONE query.
  chain?: string | string[];
  categories?: string[];
  sort?: DealSort;
};

export type DealsResponse = { deals: DealCard[]; total: number; nextOffset: number | null };

export type SearchResponse = { query: string; deals: DealCard[] };

// GET /api/v1/suggest — completions while typing (src/lib/suggest.ts on the server).
export type SuggestResponse = {
  query: string;
  terms: { text: string; count: number }[];
  categories: { id: string; label: string; count: number }[];
};

export type ComparisonRow =
  | { type: 'offer'; deal: DealCard }
  | { type: 'shelf'; chain: string; price: number; recordedAt: string; checkedAt: string };

export type PriceHistory = {
  points: { recordedAt: string; price: number; supermarket: string; kind: string | null }[];
  min: number | null;
  max: number | null;
  avg: number | null;
  current: number | null;
  verdict: 'lowest' | 'good' | 'fair' | 'meh' | 'high' | null;
  percentAboveMin: number | null;
  daysCovered: number;
  normalPrice: number | null;
  supermarket: string | null;
};

export type OfferResponse = {
  offer: DealCard & { description: string | null; active: boolean; leafletUrl: string | null };
  comparison: ComparisonRow[];
  history: PriceHistory;
  // Shelf price as steps + promos as points, full history (lib/price-timeline
  // on the server). Optional: a response cached before 2026-11-12 has none.
  // Draw a chart only when `timeline.reliable && timeline.quality === 'ok'`.
  timeline?: PriceTimeline;
  similar: DealCard[];
};

// GET /api/v1/feed — the home screen as ordered rails. Titles, order and which
// rails exist are the server's decision; the app draws whatever it is given
// and treats unknown `id`s like any other rail. `seeAll` = parameters for the
// Προσφορές tab's «Όλες» link (null: no link).
export type FeedSection = {
  id: string;
  title: string;
  subtitle: string | null;
  seeAll: { chain?: string; category?: string; sort?: DealSort } | null;
  deals: DealCard[];
};
export type FeedResponse = { total: number; sections: FeedSection[] };

function query(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export const api = {
  home: (signal?: AbortSignal) => get<HomeResponse>('/home', signal),
  // chains = the shopper's stores, cats = their top departments (lib/interest).
  feed: (q: { chains?: string[]; cats?: string[] } = {}, signal?: AbortSignal) =>
    get<FeedResponse>(`/feed${query({ chains: q.chains?.join(',') || undefined, cats: q.cats?.join(',') || undefined })}`, signal),
  meta: (signal?: AbortSignal) => get<MetaResponse>('/meta', signal),
  deals: (q: DealsQuery = {}, signal?: AbortSignal) =>
    get<DealsResponse>(
      `/deals${query({
        limit: q.limit,
        offset: q.offset,
        chain: Array.isArray(q.chain) ? q.chain.join(',') || undefined : q.chain,
        category: q.categories?.length ? q.categories.join(',') : undefined,
        sort: q.sort,
      })}`,
      signal,
    ),
  search: (text: string, chain?: string, signal?: AbortSignal) =>
    get<SearchResponse>(`/search${query({ q: text, chain })}`, signal),
  suggest: (text: string, signal?: AbortSignal) => get<SuggestResponse>(`/suggest${query({ q: text })}`, signal),
  offer: (id: string, signal?: AbortSignal) => get<OfferResponse>(`/offers/${encodeURIComponent(id)}`, signal),
};
