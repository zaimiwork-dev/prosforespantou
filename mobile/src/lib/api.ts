// Client for the app API (/api/v1/…, src/app/api/v1 in the website repo).
// The response types are imported from the server's own contract file, so a
// field rename there fails this app's type-check instead of a phone.
import type { DealCard } from '@shared/api/deal-card';

export type { DealCard };

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

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, `${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type DealSort = 'hot' | 'expiring' | 'discount' | 'newest' | 'price_asc' | 'price_desc';

export type DealsQuery = {
  limit?: number;
  offset?: number;
  chain?: string;
  categories?: string[];
  sort?: DealSort;
};

export type DealsResponse = { deals: DealCard[]; total: number; nextOffset: number | null };

export type SearchResponse = { query: string; deals: DealCard[] };

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
  similar: DealCard[];
};

function query(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export const api = {
  home: (signal?: AbortSignal) => get<HomeResponse>('/home', signal),
  meta: (signal?: AbortSignal) => get<MetaResponse>('/meta', signal),
  deals: (q: DealsQuery = {}, signal?: AbortSignal) =>
    get<DealsResponse>(
      `/deals${query({
        limit: q.limit,
        offset: q.offset,
        chain: q.chain,
        category: q.categories?.length ? q.categories.join(',') : undefined,
        sort: q.sort,
      })}`,
      signal,
    ),
  search: (text: string, chain?: string, signal?: AbortSignal) =>
    get<SearchResponse>(`/search${query({ q: text, chain })}`, signal),
  offer: (id: string, signal?: AbortSignal) => get<OfferResponse>(`/offers/${encodeURIComponent(id)}`, signal),
};
