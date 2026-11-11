// On-device taste signal for personalised rails: how much the shopper cares
// about each department and chain, decaying with a 14-day half-life so old
// habits fade. Never leaves the phone.
//
// Consent (GDPR, same rule as the website's `profiles`): nothing is recorded
// unless the shopper accepted statistics, and the profile is erased the moment
// they reject.
import { useMemo, useSyncExternalStore } from 'react';
import { createPersistedStore } from './shopping-list';
import { getSettings, subscribeSettings } from './settings';

export type InterestKind = 'view' | 'list_add' | 'favourite' | 'filter';
export const WEIGHTS: Record<InterestKind, number> = { view: 1, filter: 2, list_add: 3, favourite: 3 };

export const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_KEYS = 60; // keeps the stored profile small

// score is valid as of `at`; read it through decayed().
type Entry = { score: number; at: number };
export type Profile = { categories: Record<string, Entry>; chains: Record<string, Entry> };
const EMPTY: Profile = { categories: {}, chains: {} };

export function decayed(e: Entry, now: number): number {
  const age = Math.max(0, now - e.at);
  return e.score * Math.pow(0.5, age / HALF_LIFE_MS);
}

export function bump(map: Record<string, Entry>, key: string, weight: number, now: number): Record<string, Entry> {
  const prev = map[key];
  const next: Record<string, Entry> = { ...map, [key]: { score: (prev ? decayed(prev, now) : 0) + weight, at: now } };
  const keys = Object.keys(next);
  if (keys.length <= MAX_KEYS) return next;
  // Drop the weakest so one long-lived profile cannot grow without bound.
  const weakest = keys.sort((a, b) => decayed(next[a], now) - decayed(next[b], now)).slice(0, keys.length - MAX_KEYS);
  for (const k of weakest) delete next[k];
  return next;
}

export function rank(map: Record<string, Entry>, n: number, now: number): string[] {
  return Object.entries(map)
    .map(([key, e]) => ({ key, s: decayed(e, now) }))
    .filter((x) => x.s > 0.05)
    .sort((a, b) => b.s - a.s || a.key.localeCompare(b.key))
    .slice(0, n)
    .map((x) => x.key);
}

const validMap = (raw: unknown): Record<string, Entry> => {
  const out: Record<string, Entry> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const e = v as Partial<Entry> | null;
      if (e && Number.isFinite(e.score) && Number.isFinite(e.at)) out[k] = { score: e.score!, at: e.at! };
    }
  }
  return out;
};
function sanitize(raw: unknown): Profile {
  const p = (raw ?? {}) as Partial<Profile>;
  return { categories: validMap(p.categories), chains: validMap(p.chains) };
}

const store = createPersistedStore<Profile>('prosfores-pantou:interest:v1', EMPTY, sanitize);

export function noteInterest(kind: InterestKind, target: { category?: string | null; chain?: string | null }) {
  if (getSettings().consent !== 'accepted') return;
  const { category, chain } = target;
  if (!category && !chain) return;
  const now = Date.now();
  const w = WEIGHTS[kind];
  void store.update((p) => ({
    categories: category ? bump(p.categories, category, w, now) : p.categories,
    chains: chain ? bump(p.chains, chain, w, now) : p.chains,
  }));
}

export function topInterests(n: number, now = Date.now(), profile: Profile = store.get()): { categories: string[]; chains: string[] } {
  return { categories: rank(profile.categories, n, now), chains: rank(profile.chains, n, now) };
}

const topInterestsNow = (n: number, profile: Profile) => topInterests(n, Date.now(), profile);

export const clearInterests = () => store.update(() => EMPTY);

// Consent withdrawn -> erase now, not at the next launch.
subscribeSettings(() => {
  if (getSettings().consent === 'rejected' && (!store.isLoaded() || store.get() !== EMPTY)) void clearInterests();
});

export function useInterests(n = 3) {
  const profile = useSyncExternalStore(store.subscribe, store.get, store.get);
  // Ranked as of the render that sees a new profile; decay over minutes is irrelevant.
  return useMemo(() => topInterestsNow(n, profile), [profile, n]);
}
