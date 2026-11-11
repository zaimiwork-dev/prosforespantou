// vi.mock calls are hoisted by vitest; the imports below them are intentional.
/* eslint-disable import/first */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
vi.mock('./analytics', () => ({ track: () => {} }));
// Read the snapshot directly, outside a component.
vi.mock('react', () => ({ useSyncExternalStore: (_sub: unknown, get: () => unknown) => get() }));

import { clearRecentSearches, rememberSearch, useRecentSearches } from './recent-searches';

describe('recent searches', () => {
  beforeEach(async () => {
    await clearRecentSearches();
  });

  it('puts the newest first and ignores blanks', async () => {
    await rememberSearch('γάλα');
    await rememberSearch('   ');
    await rememberSearch('ψωμί');
    expect(useRecentSearches()).toEqual(['ψωμί', 'γάλα']);
  });

  it('moves a repeat in any letter case to the front instead of duplicating it', async () => {
    await rememberSearch('Γάλα');
    await rememberSearch('ψωμί');
    await rememberSearch('γάλα');
    expect(useRecentSearches()).toEqual(['γάλα', 'ψωμί']);
  });

  it('keeps at most 10', async () => {
    for (let i = 0; i < 14; i++) await rememberSearch(`q${i}`);
    const list = useRecentSearches();
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('q13');
  });
});
