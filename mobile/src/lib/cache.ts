// Stale-while-revalidate cache behind useApi: an in-memory store backed by
// AsyncStorage, so the last good answer is on screen even when the shop has no
// signal. Everything React reads from here is an immutable snapshot that is
// REPLACED on change (never mutated) — the React Compiler memoises anything
// else, and a screen would spin forever (it did on 11-05).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CACHE_PREFIX = 'cache:v1:';
export const MAX_ENTRIES = 40;
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export type CacheEntry<T = unknown> = { data: T; fetchedAt: number };

// ---- Pure helpers (unit-tested without AsyncStorage) -----------------------

export function isFresh(entry: Pick<CacheEntry, 'fetchedAt'> | undefined, ttlMs: number, now: number): boolean {
  if (!entry) return false;
  const age = now - entry.fetchedAt;
  // A clock that went backwards must not make an entry fresh forever.
  return age >= 0 && age < ttlMs;
}

// Keys to drop so that at most `max` remain: the oldest go first.
export function pickEvictions(entries: { key: string; fetchedAt: number }[], max: number): string[] {
  if (entries.length <= max) return [];
  return [...entries]
    .sort((a, b) => b.fetchedAt - a.fetchedAt)
    .slice(max)
    .map((e) => e.key);
}

// Disk content is untrusted: anything not shaped like an entry is ignored.
export function parseEntry(raw: string | null | undefined): CacheEntry | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CacheEntry> | null;
    if (!v || typeof v !== 'object' || !Number.isFinite(v.fetchedAt) || !('data' in v) || v.data == null) return null;
    return { data: v.data, fetchedAt: v.fetchedAt as number };
  } catch {
    return null;
  }
}

// «10:32» for today, «5 Νοε» for older (the stale banner's wording).
export function formatUpdatedAt(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay
    ? d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
}

// ---- Store ------------------------------------------------------------------

export type KeyState = {
  entry: CacheEntry | undefined;
  // The last request for this key failed (cleared by the next success).
  error: boolean;
  fetching: boolean;
  // True only for refresh() — pull-to-refresh and «Δοκίμασε ξανά» — so a quiet
  // background revalidate does not pop the pull-down spinner.
  refreshing: boolean;
};

export const IDLE: KeyState = { entry: undefined, error: false, fetching: false, refreshing: false };

const states = new Map<string, KeyState>();
const listeners = new Map<string, Set<() => void>>();
const hydrating = new Map<string, Promise<void>>();
const inflight = new Map<string, { ctrl: AbortController; refs: number }>();

export const getState = (key: string): KeyState => states.get(key) ?? IDLE;

function setState(key: string, patch: Partial<KeyState>) {
  states.set(key, { ...getState(key), ...patch });
  listeners.get(key)?.forEach((l) => l());
}

export function subscribe(key: string, l: () => void): () => void {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(l);
  return () => {
    set.delete(l);
    if (set.size === 0) listeners.delete(key);
  };
}

// Disk → memory, once per key. A newer answer that arrived meanwhile wins.
export function hydrate(key: string): Promise<void> {
  if (getState(key).entry) return Promise.resolve();
  let p = hydrating.get(key);
  if (!p) {
    p = AsyncStorage.getItem(CACHE_PREFIX + key)
      .then((raw) => {
        const entry = parseEntry(raw);
        if (entry && !getState(key).entry) setState(key, { entry });
      })
      .catch(() => {
        // Unreadable storage behaves like an empty cache.
      })
      .finally(() => {
        hydrating.delete(key);
      });
    hydrating.set(key, p);
  }
  return p;
}

async function persist(key: string, entry: CacheEntry) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    const all = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX));
    if (all.length <= MAX_ENTRIES) return;
    const rows = await AsyncStorage.multiGet(all);
    const known = rows.map(([k, raw]) => ({ key: k, fetchedAt: parseEntry(raw)?.fetchedAt ?? 0 }));
    const drop = pickEvictions(known, MAX_ENTRIES);
    if (drop.length) await AsyncStorage.multiRemove(drop);
    // Memory follows disk, but a key a screen is showing right now stays.
    for (const k of drop) {
      const mk = k.slice(CACHE_PREFIX.length);
      if (!listeners.has(mk)) states.delete(mk);
    }
  } catch {
    // A full or broken disk only costs offline support, never the screen.
  }
}

// Starts (or joins) the request for `key`. Several screens asking for the same
// key share one request; it is cancelled when the last of them lets go.
// Returns that release function.
export function fetchKey<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  opts: { manual?: boolean } = {},
): () => void {
  let job = inflight.get(key);
  if (job) {
    job.refs += 1;
    if (opts.manual) setState(key, { refreshing: true });
  } else {
    const ctrl = new AbortController();
    job = { ctrl, refs: 1 };
    inflight.set(key, job);
    // No entry yet: a failure before was a «no data» error; starting again is
    // a plain loading state. With an entry the banner stays until success.
    setState(key, { fetching: true, refreshing: !!opts.manual, ...(getState(key).entry ? {} : { error: false }) });
    fetcher(ctrl.signal)
      .then((data) => {
        if (inflight.get(key)?.ctrl !== ctrl) return;
        inflight.delete(key);
        const entry: CacheEntry = { data, fetchedAt: Date.now() };
        setState(key, { entry, error: false, fetching: false, refreshing: false });
        void persist(key, entry);
      })
      .catch(() => {
        if (inflight.get(key)?.ctrl !== ctrl) return;
        inflight.delete(key);
        setState(key, { error: true, fetching: false, refreshing: false });
      });
  }
  const mine = job;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mine.refs -= 1;
    if (mine.refs <= 0 && inflight.get(key) === mine) {
      inflight.delete(key);
      mine.ctrl.abort();
      setState(key, { fetching: false, refreshing: false });
    }
  };
}

// Test hook: forget everything held in memory.
export function resetCacheForTests() {
  states.clear();
  listeners.clear();
  hydrating.clear();
  inflight.clear();
}
