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

export const api = {
  home: (signal?: AbortSignal) => get<HomeResponse>('/home', signal),
  meta: (signal?: AbortSignal) => get<MetaResponse>('/meta', signal),
};
